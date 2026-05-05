/**
 * Expo push worker — claims expo_push_notification_jobs and POSTs to Expo Push API.
 *
 * Human / ops checklist (not automated):
 * 1) EAS: upload FCM + APNs credentials (`npm run mobile:eas:credentials` from repo root).
 * 2) Expo: create an access token (expo.dev → account → access tokens) for push API auth.
 * 3) Supabase project secrets: set EXPO_ACCESS_TOKEN (or HAVEN_EXPO_ACCESS_TOKEN) on the
 *    `expo-push-worker` Edge Function. Redeploy the function after setting secrets.
 * 4) Apply migration `20260419000084_add_expo_push_dispatch.sql` and deploy this function.
 * 5) Build a dev client on a physical device; register token from the mobile app after sign-in.
 */
import {
  authenticateUser,
  createServiceClient,
  jsonResponse,
  okOptionsResponse,
  parseJsonBody,
  requireSupabaseEnv,
  verifyCronSecret,
} from '../_shared/common.ts';

type WorkerRequest = {
  mode?: 'cron' | 'manual' | 'wakeup';
  maxJobs?: number;
};

type ExpoPushDispatchJobRow = {
  job_id: string;
  notification_recipient_id: string;
  notification_event_id: string;
  recipient_user_id: string;
  subscription_id: string;
  subscription_expo_push_token: string;
  subscription_platform: string;
  kind: 'friend_request_received' | 'friend_request_accepted' | 'dm_message' | 'channel_mention' | 'system';
  source_kind: string;
  source_id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  payload: unknown;
  recipient_deliver_in_app: boolean;
  recipient_deliver_sound: boolean;
  recipient_deliver_push: boolean;
  recipient_seen_at: string | null;
  recipient_read_at: string | null;
  recipient_dismissed_at: string | null;
  attempts: number;
  status: string;
  available_at: string;
  created_at: string;
};

type ExpoSendTimeRecheckRow = {
  job_id: string;
  should_deliver_push: boolean;
  reason: string | null;
};

type DeliveryTraceInsertRow = {
  notification_recipient_id: string | null;
  notification_event_id: string | null;
  recipient_user_id: string | null;
  transport: 'expo_push';
  stage: 'send_time' | 'claim';
  decision: 'send' | 'skip' | 'defer';
  reason_code: string;
  details: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: string;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asTrimmedString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const truncate = (value: string, max: number): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};

const getPayloadString = (payload: unknown, key: string): string | null => {
  const obj = asObject(payload);
  if (!obj) return null;
  return asTrimmedString(obj[key]);
};

const buildClickUrl = (job: ExpoPushDispatchJobRow): string => {
  const params = new URLSearchParams();
  switch (job.kind) {
    case 'dm_message': {
      params.set('kind', 'dm_message');
      const conversationId = getPayloadString(job.payload, 'conversationId');
      if (conversationId) params.set('conversationId', conversationId);
      break;
    }
    case 'friend_request_received': {
      params.set('kind', 'friend_request_received');
      const friendRequestId = getPayloadString(job.payload, 'friendRequestId');
      if (friendRequestId) params.set('friendRequestId', friendRequestId);
      break;
    }
    case 'friend_request_accepted': {
      params.set('kind', 'friend_request_accepted');
      break;
    }
    case 'channel_mention': {
      params.set('kind', 'channel_mention');
      const communityId = getPayloadString(job.payload, 'communityId');
      const channelId = getPayloadString(job.payload, 'channelId');
      if (communityId) params.set('communityId', communityId);
      if (channelId) params.set('channelId', channelId);
      break;
    }
    case 'system':
    default:
      return '/';
  }
  params.set('recipientId', job.notification_recipient_id);
  params.set('eventId', job.notification_event_id);
  const query = params.toString();
  return query.length > 0 ? `/?${query}` : '/';
};

const getDefaultTitle = (job: ExpoPushDispatchJobRow): string => {
  const actor = job.actor_username ?? 'Someone';
  switch (job.kind) {
    case 'friend_request_received':
      return '${actor} sent you a friend request';
    case 'friend_request_accepted':
      return '${actor} accepted your friend request';
    case 'dm_message':
      return '${actor} sent you a message';
    case 'channel_mention':
      return '${actor} mentioned you';
    case 'system':
    default:
      return 'Notification';
  }
};

const getDefaultBody = (job: ExpoPushDispatchJobRow): string => {
  switch (job.kind) {
    case 'friend_request_received':
      return `Tap to view their profile.`;
    case 'friend_request_accepted':
      return `You are now friends on Haven.`;
    case 'dm_message':
      return 'Sent you a message.';
    case 'channel_mention':
      return 'Tap to view.';
    case 'system':
    default:
      return 'You have a new notification in Haven.';
  }
};

const buildExpoMessage = (job: ExpoPushDispatchJobRow): ExpoPushMessage => {
  const payloadObj = asObject(job.payload);
  const title = truncate(asTrimmedString(payloadObj?.title) ?? getDefaultTitle(job), 120);
  const body = truncate(asTrimmedString(payloadObj?.message) ?? getDefaultBody(job), 240);
  const url = buildClickUrl(job);

  const data: Record<string, unknown> = {
    url,
    kind: job.kind,
    recipientId: job.notification_recipient_id,
    eventId: job.notification_event_id,
  };
  const conversationId = getPayloadString(job.payload, 'conversationId');
  if (conversationId) data.conversationId = conversationId;
  const friendRequestId = getPayloadString(job.payload, 'friendRequestId');
  if (friendRequestId) data.friendRequestId = friendRequestId;
  const communityId = getPayloadString(job.payload, 'communityId');
  if (communityId) data.communityId = communityId;
  const channelId = getPayloadString(job.payload, 'channelId');
  if (channelId) data.channelId = channelId;

  const priority: ExpoPushMessage['priority'] =
    job.kind === 'dm_message' || job.kind === 'channel_mention' ? 'high' : 'default';

  return {
    to: job.subscription_expo_push_token,
    title,
    body,
    data,
    sound: 'default',
    priority,
    channelId: job.subscription_platform === 'android' ? 'default' : undefined,
  };
};

const computeRetryDelaySeconds = (attempts: number): number =>
  Math.min(3600, Math.max(15, 30 * Math.max(attempts, 1)));

const getSendTimeRecheckReasonCode = (reason: string | null): string => {
  switch (reason) {
    case 'recipient_read_or_dismissed':
      return 'recipient_read';
    case 'push_pref_disabled':
      return 'push_pref_disabled';
    case 'dm_conversation_muted':
      return 'dm_conversation_muted';
    default:
      return 'push_pref_disabled';
  }
};

const getSendTimeRecheckSkipMessage = (reason: string | null): string => {
  switch (reason) {
    case 'recipient_read_or_dismissed':
      return 'Notification became read/dismissed before expo push send-time recheck.';
    case 'push_pref_disabled':
      return 'Expo push delivery disabled by current preferences/flags at send-time recheck.';
    case 'dm_conversation_muted':
      return 'DM conversation muted before expo push send-time recheck.';
    default:
      return 'Expo push delivery suppressed by send-time recheck.';
  }
};

const insertDeliveryTrace = async (
  supabaseAdmin: ReturnType<typeof createServiceClient>,
  row: DeliveryTraceInsertRow,
): Promise<void> => {
  const { error } = await supabaseAdmin.from('notification_delivery_traces' as never).insert(row as never);
  if (error) {
    console.warn('expo-push-worker failed to insert notification delivery trace:', {
      error: error.message,
      reasonCode: row.reason_code,
    });
  }
};

const buildTraceBase = (job: ExpoPushDispatchJobRow) => ({
  notification_recipient_id: job.notification_recipient_id,
  notification_event_id: job.notification_event_id,
  recipient_user_id: job.recipient_user_id,
  transport: 'expo_push' as const,
  details: {
    jobId: job.job_id,
    subscriptionId: job.subscription_id,
    kind: job.kind,
    attempts: job.attempts,
  },
});

const requireExpoAccessToken = (): string => {
  const token =
    Deno.env.get('HAVEN_EXPO_ACCESS_TOKEN')?.trim() || Deno.env.get('EXPO_ACCESS_TOKEN')?.trim() || '';
  if (!token) {
    throw new Error(
      'Missing Expo push access token. Set EXPO_ACCESS_TOKEN or HAVEN_EXPO_ACCESS_TOKEN on expo-push-worker.',
    );
  }
  return token;
};

type WorkerStats = {
  mode: 'cron' | 'manual';
  wakeSource: 'cron' | 'manual' | 'wakeup';
  claimedJobs: number;
  sent: number;
  skipped: number;
  retryableFailures: number;
  deadLetters: number;
  invalidatedSubscriptions: number;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string; [key: string]: unknown };
};

const parseExpoTickets = (payload: unknown): ExpoTicket[] => {
  const root = asObject(payload);
  const data = root?.data;
  if (Array.isArray(data)) return data as ExpoTicket[];
  if (data && typeof data === 'object') return [data as ExpoTicket];
  return [];
};

const isInvalidDeviceTicket = (ticket: ExpoTicket): boolean => {
  const err = asTrimmedString(ticket.details?.error)?.toLowerCase() ?? '';
  const msg = (ticket.message ?? '').toLowerCase();
  return err.includes('devicenotregistered') || msg.includes('devicenotregistered');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return okOptionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const isCron = verifyCronSecret(req);
  if (!isCron) {
    try {
      await authenticateUser(req);
    } catch (error) {
      return jsonResponse({ code: 401, message: error instanceof Error ? error.message : 'Unauthorized' }, 401);
    }
  }

  let env;
  try {
    env = requireSupabaseEnv();
  } catch (error) {
    return jsonResponse({ code: 500, message: error instanceof Error ? error.message : 'Missing env' }, 500);
  }

  let expoAccessToken: string;
  try {
    expoAccessToken = requireExpoAccessToken();
  } catch (error) {
    return jsonResponse({ code: 500, message: error instanceof Error ? error.message : 'Missing Expo token' }, 500);
  }

  const body = (await parseJsonBody<WorkerRequest>(req)) ?? {};
  const requestedMode = typeof body.mode === 'string' ? body.mode : null;
  const wakeSource: WorkerStats['wakeSource'] =
    isCron && requestedMode === 'wakeup' ? 'wakeup' : isCron ? 'cron' : 'manual';
  const maxJobs = clampInt(body.maxJobs, 1, isCron ? 200 : 50, wakeSource === 'wakeup' ? 20 : isCron ? 50 : 15);
  const supabaseAdmin = createServiceClient(env.supabaseUrl, env.serviceRoleKey);

  const stats: WorkerStats = {
    mode: isCron ? 'cron' : 'manual',
    wakeSource,
    claimedJobs: 0,
    sent: 0,
    skipped: 0,
    retryableFailures: 0,
    deadLetters: 0,
    invalidatedSubscriptions: 0,
  };

  const { data: claimRows, error: claimError } = await supabaseAdmin.rpc('claim_expo_push_notification_jobs', {
    p_limit: maxJobs,
    p_lease_seconds: wakeSource === 'wakeup' ? 120 : isCron ? 180 : 120,
  });

  if (claimError) {
    console.error('expo-push-worker claim rpc failed:', claimError);
    return jsonResponse({ code: 500, message: 'Failed to claim expo push jobs' }, 500);
  }

  const jobs = (claimRows ?? []) as ExpoPushDispatchJobRow[];
  stats.claimedJobs = jobs.length;

  const dmSendTimeRecheckByJobId = new Map<string, { shouldDeliverPush: boolean; reason: string | null }>();
  const dmJobsRequiringRecheck = jobs.filter(
    (job) =>
      job.kind === 'dm_message' &&
      !job.recipient_dismissed_at &&
      !job.recipient_read_at &&
      job.recipient_deliver_push,
  );

  if (dmJobsRequiringRecheck.length > 0) {
    const { data: recheckRows, error: recheckError } = await supabaseAdmin.rpc(
      'recheck_expo_push_notification_jobs_for_send',
      { p_job_ids: dmJobsRequiringRecheck.map((j) => j.job_id) },
    );
    if (recheckError) {
      console.warn('expo-push-worker send-time recheck rpc failed; using claim snapshot:', recheckError);
    } else {
      for (const row of (recheckRows ?? []) as ExpoSendTimeRecheckRow[]) {
        if (!row?.job_id) continue;
        dmSendTimeRecheckByJobId.set(row.job_id, {
          shouldDeliverPush: row.should_deliver_push === true,
          reason: typeof row.reason === 'string' ? row.reason : null,
        });
      }
    }
  }

  const jobsToSend: ExpoPushDispatchJobRow[] = [];

  for (const job of jobs) {
    try {
      if (job.recipient_dismissed_at || job.recipient_read_at) {
        const reasonCode = job.recipient_dismissed_at ? 'recipient_dismissed' : 'recipient_read';
        const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
          p_job_id: job.job_id,
          p_outcome: 'skipped',
          p_error: 'Notification already dismissed/read before expo push delivery.',
          p_retry_delay_seconds: 60,
          p_provider_status_code: null,
        });
        if (completeError) console.error('expo-push-worker failed to mark skipped job:', completeError);
        stats.skipped += 1;
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job),
          stage: 'send_time',
          decision: 'skip',
          reason_code: reasonCode,
          details: { ...buildTraceBase(job).details },
        });
        continue;
      }

      if (!job.recipient_deliver_push) {
        const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
          p_job_id: job.job_id,
          p_outcome: 'skipped',
          p_error: 'Expo push delivery disabled by current preferences/flags.',
          p_retry_delay_seconds: 60,
          p_provider_status_code: null,
        });
        if (completeError) console.error('expo-push-worker failed to mark push-disabled job skipped:', completeError);
        stats.skipped += 1;
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job),
          stage: 'send_time',
          decision: 'skip',
          reason_code: 'push_pref_disabled',
          details: { ...buildTraceBase(job).details },
        });
        continue;
      }

      if (job.kind === 'dm_message') {
        const sendTimeRecheck = dmSendTimeRecheckByJobId.get(job.job_id);
        if (sendTimeRecheck && !sendTimeRecheck.shouldDeliverPush) {
          const reasonCode = getSendTimeRecheckReasonCode(sendTimeRecheck.reason);
          const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
            p_job_id: job.job_id,
            p_outcome: 'skipped',
            p_error: getSendTimeRecheckSkipMessage(sendTimeRecheck.reason),
            p_retry_delay_seconds: 60,
            p_provider_status_code: null,
          });
          if (completeError) console.error('expo-push-worker failed to mark send-time recheck skip:', completeError);
          stats.skipped += 1;
          await insertDeliveryTrace(supabaseAdmin, {
            ...buildTraceBase(job),
            stage: 'send_time',
            decision: 'skip',
            reason_code: reasonCode,
            details: { ...buildTraceBase(job).details, sendTimeRecheckReason: sendTimeRecheck.reason },
          });
          continue;
        }
      }

      jobsToSend.push(job);
    } catch (e) {
      console.error('expo-push-worker job prep error:', e);
    }
  }

  const BATCH = 100;
  for (let i = 0; i < jobsToSend.length; i += BATCH) {
    const batch = jobsToSend.slice(i, i + BATCH);
    const messages = batch.map((j) => buildExpoMessage(j));

    let httpStatus = 0;
    let responseJson: unknown = null;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expoAccessToken}`,
        },
        body: JSON.stringify(messages),
      });
      httpStatus = res.status;
      responseJson = await res.json().catch(() => null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Expo push HTTP failure';
      for (const job of batch) {
        const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
          p_job_id: job.job_id,
          p_outcome: 'retryable_failed',
          p_error: truncate(msg, 3900),
          p_retry_delay_seconds: computeRetryDelaySeconds(job.attempts ?? 1),
          p_provider_status_code: httpStatus || null,
        });
        if (completeError) console.error('expo-push-worker complete after HTTP error:', completeError);
        stats.retryableFailures += 1;
      }
      continue;
    }

    const tickets = parseExpoTickets(responseJson);

    for (let j = 0; j < batch.length; j++) {
      const job = batch[j]!;
      const ticket = tickets[j] ?? {};

      if (ticket.status === 'ok') {
        const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
          p_job_id: job.job_id,
          p_outcome: 'done',
          p_error: null,
          p_retry_delay_seconds: 120,
          p_provider_status_code: httpStatus,
        });
        if (completeError) {
          console.error('expo-push-worker failed to complete sent job:', completeError);
        } else {
          stats.sent += 1;
          await insertDeliveryTrace(supabaseAdmin, {
            ...buildTraceBase(job),
            stage: 'send_time',
            decision: 'send',
            reason_code: 'sent',
            details: { ...buildTraceBase(job).details, expoTicketId: ticket.id ?? null, httpStatus },
          });
        }
        continue;
      }

      const ticketMessage = [ticket.message, asObject(ticket.details)?.error]
        .filter(Boolean)
        .join(' | ');
      const terminalDevice = isInvalidDeviceTicket(ticket);
      const terminalPayload =
        (ticket.message ?? '').toLowerCase().includes('messagetobig') ||
        (ticket.message ?? '').toLowerCase().includes('messagetoobig');

      let outcome: 'retryable_failed' | 'dead_letter' = 'retryable_failed';
      let retryDelaySeconds = computeRetryDelaySeconds(job.attempts ?? 1);

      if (terminalDevice) {
        outcome = 'dead_letter';
        retryDelaySeconds = 60;
        const { error: delErr } = await supabaseAdmin
          .from('expo_push_subscriptions' as never)
          .delete()
          .eq('id', job.subscription_id);
        if (delErr) {
          console.warn('expo-push-worker failed to delete invalid expo subscription:', delErr.message);
        } else {
          stats.invalidatedSubscriptions += 1;
        }
      } else if (terminalPayload || (job.attempts ?? 1) >= 5) {
        outcome = 'dead_letter';
      }

      const { error: completeError } = await supabaseAdmin.rpc('complete_expo_push_notification_job', {
        p_job_id: job.job_id,
        p_outcome: outcome,
        p_error: truncate(ticketMessage || `Expo ticket status: ${ticket.status ?? 'unknown'}`, 3900),
        p_retry_delay_seconds: retryDelaySeconds,
        p_provider_status_code: httpStatus,
      });
      if (completeError) {
        console.error('expo-push-worker failed to complete failed job:', completeError);
      }

      if (outcome === 'dead_letter') stats.deadLetters += 1;
      else stats.retryableFailures += 1;

      await insertDeliveryTrace(supabaseAdmin, {
        ...buildTraceBase(job),
        stage: 'send_time',
        decision: 'skip',
        reason_code: outcome === 'dead_letter' ? 'provider_terminal_failure' : 'provider_retryable_failure',
        details: {
          ...buildTraceBase(job).details,
          httpStatus,
          ticket,
        },
      });
    }
  }

  return jsonResponse(stats);
});
