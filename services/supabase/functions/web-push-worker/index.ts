import webpush from 'npm:web-push@3.6.7';
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
  mode?: 'cron' | 'manual' | 'wakeup' | 'shadow';
  maxJobs?: number;
};

type WebPushDispatchJobRow = {
  job_id: string;
  notification_recipient_id: string;
  notification_event_id: string;
  recipient_user_id: string;
  subscription_id: string;
  subscription_endpoint: string;
  subscription_p256dh_key: string;
  subscription_auth_key: string;
  subscription_expiration_time: string | null;
  subscription_user_agent: string | null;
  subscription_client_platform: string | null;
  subscription_app_display_mode: string | null;
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

type SendNotificationResult = {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
};

type WebPushSendError = Error & {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
};

type WebPushSendTimeRecheckRow = {
  job_id: string;
  should_deliver_push: boolean;
  reason: string | null;
};

type DeliveryTraceInsertRow = {
  notification_recipient_id: string | null;
  notification_event_id: string | null;
  recipient_user_id: string | null;
  transport: 'web_push';
  stage: 'send_time' | 'claim';
  decision: 'send' | 'skip' | 'defer';
  reason_code: string;
  details: Record<string, unknown>;
};

type WorkerStats = {
  mode: 'cron' | 'manual';
  wakeSource: 'cron' | 'manual' | 'wakeup' | 'shadow';
  shadow: boolean;
  claimedJobs: number;
  shadowWouldSend: number;
  sent: number;
  skipped: number;
  retryableFailures: number;
  deadLetters: number;
  invalidatedSubscriptions: number;
  shadowWouldSendByReason: Record<string, number>;
  sentByReason: Record<string, number>;
  skippedByReason: Record<string, number>;
  retryableFailuresByReason: Record<string, number>;
  deadLettersByReason: Record<string, number>;
  latencyMsBuckets: Record<string, number>;
};

const HAVEN_PUSH_ICON_PATH = '/icon-192.png';
const HAVEN_PUSH_BADGE_PATH = '/icon-192.png';

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

const buildClickUrl = (job: WebPushDispatchJobRow): string => {
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

const getDefaultTitle = (job: WebPushDispatchJobRow): string => {
  switch (job.kind) {
    case 'friend_request_received':
      return 'Friend request received';
    case 'friend_request_accepted':
      return 'Friend request accepted';
    case 'dm_message':
      return 'Direct message';
    case 'channel_mention':
      return 'Mention';
    case 'system':
    default:
      return 'Notification';
  }
};

const getDefaultBody = (job: WebPushDispatchJobRow): string => {
  switch (job.kind) {
    case 'friend_request_received':
      return `${job.actor_username ?? 'Someone'} sent you a friend request.`;
    case 'friend_request_accepted':
      return `${job.actor_username ?? 'Someone'} accepted your friend request.`;
    case 'dm_message':
      return 'You received a new direct message.';
    case 'channel_mention':
      return 'You were mentioned in a channel.';
    case 'system':
    default:
      return 'You have a new notification in Haven.';
  }
};

const buildPushPayload = (job: WebPushDispatchJobRow): Record<string, unknown> => {
  const payloadObj = asObject(job.payload);
  const title = truncate(
    asTrimmedString(payloadObj?.title) ?? getDefaultTitle(job),
    120,
  );
  const body = truncate(
    asTrimmedString(payloadObj?.message) ?? getDefaultBody(job),
    240,
  );
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

  return {
    kind: job.kind,
    title,
    body,
    data,
    notification: {
      title,
      body,
      icon: HAVEN_PUSH_ICON_PATH,
      badge: HAVEN_PUSH_BADGE_PATH,
      tag: `${job.kind}:${job.notification_recipient_id}`,
      renotify: false,
      data,
    },
  };
};

const buildSubscription = (job: WebPushDispatchJobRow) => ({
  endpoint: job.subscription_endpoint,
  expirationTime: job.subscription_expiration_time ? Date.parse(job.subscription_expiration_time) : null,
  keys: {
    p256dh: job.subscription_p256dh_key,
    auth: job.subscription_auth_key,
  },
});

const getUrgency = (job: WebPushDispatchJobRow): 'very-low' | 'low' | 'normal' | 'high' => {
  switch (job.kind) {
    case 'dm_message':
    case 'channel_mention':
      return 'high';
    case 'friend_request_received':
    case 'friend_request_accepted':
      return 'normal';
    case 'system':
    default:
      return 'low';
  }
};

// RFC8030 topic values must use the URL/filename-safe Base64 token charset and be <= 32 chars.
// UUIDs are ideal if we strip hyphens (32 lowercase hex chars).
const getPushTopic = (job: WebPushDispatchJobRow): string => {
  const fromRecipientId = job.notification_recipient_id.replace(/-/g, '');
  if (/^[A-Za-z0-9_-]{1,32}$/.test(fromRecipientId)) {
    return fromRecipientId;
  }

  const fallback = `${job.kind}_${job.notification_recipient_id}`
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 32);
  return fallback || 'havenpush';
};

const computeRetryDelaySeconds = (attempts: number): number =>
  Math.min(3600, Math.max(15, 30 * Math.max(attempts, 1)));

const getErrorStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' && Number.isFinite(statusCode) ? Math.trunc(statusCode) : null;
};

const getErrorBody = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  const body = (error as { body?: unknown }).body;
  return typeof body === 'string' && body.trim().length > 0 ? body.trim() : null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  if (typeof error === 'string' && error.trim().length > 0) return error.trim();
  return 'Unknown web push delivery failure';
};

const isTerminalSubscriptionFailure = (statusCode: number | null): boolean =>
  statusCode === 404 || statusCode === 410;

const isPermanentPayloadFailure = (statusCode: number | null): boolean =>
  statusCode === 400 || statusCode === 413;

const getSendTimeRecheckSkipMessage = (reason: string | null): string => {
  switch (reason) {
    case 'recipient_read_or_dismissed':
      return 'Notification became read/dismissed before web push send-time recheck.';
    case 'push_pref_disabled':
      return 'Web push delivery disabled by current preferences/flags at send-time recheck.';
    case 'dm_conversation_muted':
      return 'DM conversation muted before web push send-time recheck.';
    default:
      return 'Web push delivery suppressed by send-time recheck.';
  }
};

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

const incrementStatBucket = (target: Record<string, number>, key: string): void => {
  target[key] = (target[key] ?? 0) + 1;
};

const getQueueLatencyBucket = (createdAt: string | null | undefined): string => {
  if (!createdAt) return 'unknown';
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return 'unknown';
  const delta = Math.max(0, Date.now() - createdMs);
  if (delta < 1000) return '<1s';
  if (delta < 3000) return '1-3s';
  if (delta < 10000) return '3-10s';
  if (delta < 60000) return '10-60s';
  return '60s+';
};

const insertDeliveryTrace = async (
  supabaseAdmin: ReturnType<typeof createServiceClient>,
  row: DeliveryTraceInsertRow,
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('notification_delivery_traces' as never)
    .insert(row as never);
  if (error) {
    console.warn('web-push-worker failed to insert notification delivery trace:', {
      error: error.message,
      reasonCode: row.reason_code,
      stage: row.stage,
      decision: row.decision,
      recipientId: row.notification_recipient_id,
    });
  }
};

const buildTraceBase = (job: WebPushDispatchJobRow, wakeSource: WorkerStats['wakeSource']) => ({
  notification_recipient_id: job.notification_recipient_id,
  notification_event_id: job.notification_event_id,
  recipient_user_id: job.recipient_user_id,
  transport: 'web_push' as const,
  details: {
    jobId: job.job_id,
    subscriptionId: job.subscription_id,
    kind: job.kind,
    attempts: job.attempts,
    wakeSource,
  },
});

const requireVapidConfig = () => {
  const publicKey =
    Deno.env.get('HAVEN_WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ||
    Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ||
    '';
  const privateKey =
    Deno.env.get('HAVEN_WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ||
    Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ||
    '';
  const subject =
    Deno.env.get('HAVEN_WEB_PUSH_VAPID_SUBJECT')?.trim() ||
    Deno.env.get('WEB_PUSH_VAPID_SUBJECT')?.trim() ||
    '';

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      'Missing VAPID env for web push worker (HAVEN_WEB_PUSH_VAPID_PUBLIC_KEY, HAVEN_WEB_PUSH_VAPID_PRIVATE_KEY, HAVEN_WEB_PUSH_VAPID_SUBJECT).',
    );
  }

  return { publicKey, privateKey, subject };
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

  const body = (await parseJsonBody<WorkerRequest>(req)) ?? {};
  const requestedMode = body.mode;
  const shadowRequested = requestedMode === 'shadow';
  const wakeSource: WorkerStats['wakeSource'] = isCron
    ? (shadowRequested ? 'shadow' : requestedMode === 'wakeup' ? 'wakeup' : 'cron')
    : requestedMode === 'wakeup'
      ? 'wakeup'
      : shadowRequested
        ? 'shadow'
        : 'manual';
  const maxJobs = clampInt(body.maxJobs, 1, isCron ? 200 : 50, isCron ? 50 : 15);
  const supabaseAdmin = createServiceClient(env.supabaseUrl, env.serviceRoleKey);

  if (!shadowRequested) {
    let vapid;
    try {
      vapid = requireVapidConfig();
    } catch (error) {
      return jsonResponse({ code: 500, message: error instanceof Error ? error.message : 'Missing VAPID config' }, 500);
    }
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  }

  const stats: WorkerStats = {
    mode: isCron ? 'cron' : 'manual',
    wakeSource,
    shadow: shadowRequested,
    claimedJobs: 0,
    shadowWouldSend: 0,
    sent: 0,
    skipped: 0,
    retryableFailures: 0,
    deadLetters: 0,
    invalidatedSubscriptions: 0,
    shadowWouldSendByReason: {},
    sentByReason: {},
    skippedByReason: {},
    retryableFailuresByReason: {},
    deadLettersByReason: {},
    latencyMsBuckets: {
      '<1s': 0,
      '1-3s': 0,
      '3-10s': 0,
      '10-60s': 0,
      '60s+': 0,
      unknown: 0,
    },
  };

  const jobs: WebPushDispatchJobRow[] = [];
  if (shadowRequested) {
    const { data: peekRows, error: peekError } = await supabaseAdmin.rpc('peek_web_push_notification_jobs', {
      p_limit: maxJobs,
    });
    if (peekError) {
      console.error('web-push-worker peek rpc failed:', peekError);
      return jsonResponse({ code: 500, message: 'Failed to peek web push jobs for shadow mode' }, 500);
    }
    jobs.push(...((peekRows ?? []) as WebPushDispatchJobRow[]));
  } else {
    const { data: claimRows, error: claimError } = await supabaseAdmin.rpc('claim_web_push_notification_jobs', {
      p_limit: maxJobs,
      p_lease_seconds: isCron ? 180 : 120,
    });

    if (claimError) {
      console.error('web-push-worker claim rpc failed:', claimError);
      return jsonResponse({ code: 500, message: 'Failed to claim web push jobs' }, 500);
    }
    jobs.push(...((claimRows ?? []) as WebPushDispatchJobRow[]));
  }

  stats.claimedJobs = jobs.length;

  const dmSendTimeRecheckByJobId = new Map<
    string,
    { shouldDeliverPush: boolean; reason: string | null }
  >();
  const dmJobsRequiringRecheck = jobs.filter((job) =>
    job.kind === 'dm_message' &&
    !job.recipient_dismissed_at &&
    !job.recipient_read_at &&
    job.recipient_deliver_push
  );

  if (dmJobsRequiringRecheck.length > 0) {
    const { data: recheckRows, error: recheckError } = await supabaseAdmin.rpc(
      'recheck_web_push_notification_jobs_for_send',
      {
        p_job_ids: dmJobsRequiringRecheck.map((job) => job.job_id),
      },
    );

    if (recheckError) {
      console.warn('web-push-worker send-time recheck rpc failed; falling back to claim snapshot:', recheckError);
    } else {
      for (const row of (recheckRows ?? []) as WebPushSendTimeRecheckRow[]) {
        if (!row?.job_id) continue;
        dmSendTimeRecheckByJobId.set(row.job_id, {
          shouldDeliverPush: row.should_deliver_push === true,
          reason: typeof row.reason === 'string' ? row.reason : null,
        });
      }
    }
  }

  for (const job of jobs) {
    try {
      incrementStatBucket(stats.latencyMsBuckets, getQueueLatencyBucket(job.created_at));
      if (shadowRequested) {
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job, stats.wakeSource),
          stage: 'claim',
          decision: 'defer',
          reason_code: 'shadow_peek',
          details: {
            ...buildTraceBase(job, stats.wakeSource).details,
            shadow: true,
            selectedBy: 'peek_web_push_notification_jobs',
          },
        });
      }

      if (job.recipient_dismissed_at || job.recipient_read_at) {
        const reasonCode = job.recipient_dismissed_at ? 'recipient_dismissed' : 'recipient_read';
        if (!shadowRequested) {
          const { error: completeError } = await supabaseAdmin.rpc('complete_web_push_notification_job', {
            p_job_id: job.job_id,
            p_outcome: 'skipped',
            p_error: 'Notification already dismissed/read before web push delivery.',
            p_retry_delay_seconds: 60,
            p_provider_status_code: null,
          });
          if (completeError) console.error('web-push-worker failed to mark skipped job:', completeError);
        }
        incrementStatBucket(stats.skippedByReason, reasonCode);
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job, stats.wakeSource),
          stage: 'send_time',
          decision: 'skip',
          reason_code: reasonCode,
          details: {
            ...buildTraceBase(job, stats.wakeSource).details,
            recipientDismissedAt: job.recipient_dismissed_at,
            recipientReadAt: job.recipient_read_at,
            shadow: shadowRequested,
          },
        });
        stats.skipped += 1;
        continue;
      }

      if (!job.recipient_deliver_push) {
        if (!shadowRequested) {
          const { error: completeError } = await supabaseAdmin.rpc('complete_web_push_notification_job', {
            p_job_id: job.job_id,
            p_outcome: 'skipped',
            p_error: 'Web push delivery disabled by current preferences/flags.',
            p_retry_delay_seconds: 60,
            p_provider_status_code: null,
          });
          if (completeError) console.error('web-push-worker failed to mark push-disabled job skipped:', completeError);
        }
        incrementStatBucket(stats.skippedByReason, 'push_pref_disabled');
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job, stats.wakeSource),
          stage: 'send_time',
          decision: 'skip',
          reason_code: 'push_pref_disabled',
          details: {
            ...buildTraceBase(job, stats.wakeSource).details,
            recipientDeliverPush: job.recipient_deliver_push,
            shadow: shadowRequested,
          },
        });
        stats.skipped += 1;
        continue;
      }

      if (job.kind === 'dm_message') {
        const sendTimeRecheck = dmSendTimeRecheckByJobId.get(job.job_id);
        if (sendTimeRecheck && !sendTimeRecheck.shouldDeliverPush) {
          const reasonCode = getSendTimeRecheckReasonCode(sendTimeRecheck.reason);
          if (!shadowRequested) {
            const { error: completeError } = await supabaseAdmin.rpc('complete_web_push_notification_job', {
              p_job_id: job.job_id,
              p_outcome: 'skipped',
              p_error: getSendTimeRecheckSkipMessage(sendTimeRecheck.reason),
              p_retry_delay_seconds: 60,
              p_provider_status_code: null,
            });
            if (completeError) {
              console.error('web-push-worker failed to mark send-time recheck skip:', completeError);
            }
          }
          incrementStatBucket(stats.skippedByReason, reasonCode);
          await insertDeliveryTrace(supabaseAdmin, {
            ...buildTraceBase(job, stats.wakeSource),
            stage: 'send_time',
            decision: 'skip',
            reason_code: reasonCode,
            details: {
              ...buildTraceBase(job, stats.wakeSource).details,
              sendTimeRecheckReason: sendTimeRecheck.reason,
              shadow: shadowRequested,
            },
          });
          stats.skipped += 1;
          continue;
        }
      }

      if (shadowRequested) {
        const payload = buildPushPayload(job);
        incrementStatBucket(stats.shadowWouldSendByReason, 'shadow_mode_no_send');
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job, stats.wakeSource),
          stage: 'send_time',
          decision: 'defer',
          reason_code: 'shadow_mode_no_send',
          details: {
            ...buildTraceBase(job, stats.wakeSource).details,
            shadow: true,
            wouldSend: true,
            preview: {
              title: asTrimmedString(asObject(payload.notification)?.title) ?? null,
              body: asTrimmedString(asObject(payload.notification)?.body) ?? null,
              tag: asTrimmedString(asObject(payload.notification)?.tag) ?? null,
              url: asTrimmedString(asObject(payload.data)?.url) ?? null,
            },
          },
        });
        stats.shadowWouldSend += 1;
        continue;
      }

      const payload = buildPushPayload(job);
      const subscription = buildSubscription(job);

      const sendResult = (await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        {
          TTL: 300,
          urgency: getUrgency(job),
          topic: getPushTopic(job),
        },
      )) as SendNotificationResult;

      const { error: completeError } = await supabaseAdmin.rpc('complete_web_push_notification_job', {
        p_job_id: job.job_id,
        p_outcome: 'done',
        p_error: null,
        p_retry_delay_seconds: 120,
        p_provider_status_code:
          typeof sendResult?.statusCode === 'number' ? Math.trunc(sendResult.statusCode) : null,
      });

      if (completeError) {
        console.error('web-push-worker failed to complete sent job:', completeError);
      } else {
        incrementStatBucket(stats.sentByReason, 'sent');
        await insertDeliveryTrace(supabaseAdmin, {
          ...buildTraceBase(job, stats.wakeSource),
          stage: 'send_time',
          decision: 'send',
          reason_code: 'sent',
          details: {
            ...buildTraceBase(job, stats.wakeSource).details,
            providerStatusCode:
              typeof sendResult?.statusCode === 'number' ? Math.trunc(sendResult.statusCode) : null,
          },
        });
        stats.sent += 1;
      }
    } catch (error) {
      const statusCode = getErrorStatusCode(error);
      const errorBody = getErrorBody(error);
      const errorMessage = getErrorMessage(error);

      let outcome: 'retryable_failed' | 'dead_letter' = 'retryable_failed';
      let retryDelaySeconds = computeRetryDelaySeconds(job.attempts ?? 1);

      if (isTerminalSubscriptionFailure(statusCode)) {
        outcome = 'dead_letter';
        retryDelaySeconds = 60;
        const { error: deleteSubscriptionError } = await supabaseAdmin
          .from('web_push_subscriptions' as never)
          .delete()
          .eq('id', job.subscription_id);
        if (deleteSubscriptionError) {
          console.warn('web-push-worker failed to delete invalid subscription:', {
            subscriptionId: job.subscription_id,
            error: deleteSubscriptionError.message,
          });
        } else {
          stats.invalidatedSubscriptions += 1;
        }
      } else if (isPermanentPayloadFailure(statusCode) || (job.attempts ?? 1) >= 5) {
        outcome = 'dead_letter';
      }

      const combinedError = truncate(
        [
          statusCode ? `HTTP ${statusCode}` : null,
          errorMessage || null,
          errorBody || null,
        ]
          .filter(Boolean)
          .join(' | '),
        3900,
      );

      const { error: completeError } = await supabaseAdmin.rpc('complete_web_push_notification_job', {
        p_job_id: job.job_id,
        p_outcome: outcome,
        p_error: combinedError,
        p_retry_delay_seconds: retryDelaySeconds,
        p_provider_status_code: statusCode,
      });

      if (completeError) {
        console.error('web-push-worker failed to complete failed job:', {
          jobId: job.job_id,
          completeError,
        });
      }

      if (outcome === 'dead_letter') {
        stats.deadLetters += 1;
        incrementStatBucket(stats.deadLettersByReason, 'provider_terminal_failure');
      } else {
        stats.retryableFailures += 1;
        incrementStatBucket(stats.retryableFailuresByReason, 'provider_retryable_failure');
      }

      await insertDeliveryTrace(supabaseAdmin, {
        ...buildTraceBase(job, stats.wakeSource),
        stage: 'send_time',
        decision: 'skip',
        reason_code: outcome === 'dead_letter' ? 'provider_terminal_failure' : 'provider_retryable_failure',
        details: {
          ...buildTraceBase(job, stats.wakeSource).details,
          providerStatusCode: statusCode,
          errorMessage,
          errorBody,
          outcome,
        },
      });

      console.warn('web-push-worker delivery failed:', {
        jobId: job.job_id,
        notificationRecipientId: job.notification_recipient_id,
        subscriptionId: job.subscription_id,
        statusCode,
        error: errorMessage,
      });
    }
  }

  return jsonResponse(stats);
});
