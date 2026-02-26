import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseCliCommand, resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const generatedUsersPath = path.join(repoRoot, 'supabase/tests/.generated/users.json');

const DEFAULTS = {
  prepare: false,
  invokeWorker: true,
  strictWorker: false,
  workerMode: 'shadow',
  maxJobs: 15,
  traceLimit: 100,
  json: false,
};

function printHelp() {
  console.log(`Usage: node scripts/test/run-notification-dispatch-smoke.mjs [options]

Local backend smoke runner for the notification/web-push pipeline.

What it does:
  1. (Optional) resets local Supabase + boots test users + fixture SQL
  2. signs in fixture users (member_a, member_b, platform_staff_active)
  3. ensures a web push subscription exists for member_a (dummy endpoint)
  4. enables friend-request push prefs for member_a
  5. sends a friend request from member_b -> member_a
  6. inspects notification event/recipient + queued web push jobs
  7. optionally invokes web-push-worker (shadow/manual) and prints traces

Options:
  --prepare              Reset local DB and load fixtures before running (deterministic)
  --skip-worker          Do not invoke web-push-worker (queue/trace setup only)
  --strict-worker        Fail if worker invoke is unavailable/fails
  --worker-mode=<mode>   Worker mode: shadow | manual (default: shadow)
  --max-jobs=<n>         Max jobs for worker invoke (default: 15)
  --trace-limit=<n>      Recent backend trace limit for parity summaries (default: 100)
  --json                 Print JSON summary instead of human-readable output
  --help                 Show this help

Examples:
  npm run test:notifications:smoke -- --prepare --skip-worker
  npm run test:notifications:smoke -- --prepare --worker-mode=shadow
  npm run test:notifications:smoke -- --worker-mode=manual --strict-worker
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--prepare') {
      options.prepare = true;
      continue;
    }
    if (arg === '--skip-worker') {
      options.invokeWorker = false;
      continue;
    }
    if (arg === '--strict-worker') {
      options.strictWorker = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg.startsWith('--worker-mode=')) {
      const value = arg.slice('--worker-mode='.length).trim();
      if (value === 'shadow' || value === 'manual') {
        options.workerMode = value;
      } else {
        throw new Error(`Unsupported --worker-mode value "${value}". Use shadow or manual.`);
      }
      continue;
    }
    if (arg.startsWith('--max-jobs=')) {
      const value = Number.parseInt(arg.slice('--max-jobs='.length), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --max-jobs value "${arg}".`);
      }
      options.maxJobs = Math.trunc(value);
      continue;
    }
    if (arg.startsWith('--trace-limit=')) {
      const value = Number.parseInt(arg.slice('--trace-limit='.length), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --trace-limit value "${arg}".`);
      }
      options.traceLimit = Math.max(1, Math.min(500, Math.trunc(value)));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function run(command, args, options = {}) {
  console.log(`[notif-smoke] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? false,
  });
}

function formatUnknownError(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return '[non-serializable error object]';
    }
  }
  return String(error);
}

function runPrepareFlow() {
  const cli = getSupabaseCliCommand();
  run(cli.command, [...cli.baseArgs, 'db', 'reset', '--local'], { shell: cli.shell });
  run('node', ['scripts/test/bootstrap-local-auth-users.mjs']);
  run('node', ['scripts/test/run-supabase-sql-suite.mjs', '--fixtures-only']);
}

function loadFixtureUsers() {
  let raw;
  try {
    raw = readFileSync(generatedUsersPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Fixture users file not found at ${generatedUsersPath}. Run with --prepare or run "npm run test:db:users" first. (${error.message})`
    );
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') {
    throw new Error(`Fixture users file is malformed: ${generatedUsersPath}`);
  }
  return parsed.users;
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInFixtureUser(url, anonKey, spec, label) {
  if (!spec?.email || !spec?.password || !spec?.id) {
    throw new Error(`Missing fixture user "${label}" in ${generatedUsersPath}`);
  }
  const client = createSupabaseClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: spec.email,
    password: spec.password,
  });
  if (error) throw new Error(`Failed to sign in fixture "${label}": ${error.message}`);
  if (!data.session?.access_token) {
    throw new Error(`Fixture "${label}" sign-in returned no session access token.`);
  }
  return client;
}

async function rpc(client, functionName, args = undefined) {
  const { data, error } = await client.rpc(functionName, args);
  if (error) throw error;
  return data;
}

async function ensureWakupConfigAndCron(adminClient, staffClient, env, summary) {
  const cronSecret = 'local-notification-smoke-cron-secret';

  try {
    await rpc(adminClient, 'set_haven_background_cron_config', {
      p_edge_base_url: env.API_URL,
      p_cron_shared_secret: cronSecret,
      p_enabled: true,
    });
    summary.actions.push('configured background_worker_cron_config for local API URL');
  } catch (error) {
    summary.warnings.push(
      `Unable to configure background worker cron config (continuing): ${formatUnknownError(error)}`
    );
  }

  try {
    const data = await rpc(staffClient, 'update_web_push_dispatch_wakeup_config', {
      p_enabled: true,
      p_shadow_mode: true,
      p_min_interval_seconds: 2,
    });
    summary.wakeupConfig = Array.isArray(data) ? data[0] ?? null : data ?? null;
    summary.actions.push('set wakeup scheduler to enabled + shadow_mode + 2s debounce');
  } catch (error) {
    summary.warnings.push(
      `Unable to update wakeup scheduler config as platform staff (continuing): ${formatUnknownError(error)}`
    );
  }
}

async function ensureRecipientNotificationPrefs(memberClient, summary) {
  const currentRows = await rpc(memberClient, 'get_my_notification_preferences');
  const current = Array.isArray(currentRows) ? currentRows[0] : currentRows;
  if (!current) {
    throw new Error('get_my_notification_preferences returned no row for member_a.');
  }

  const updateArgs = {
    p_friend_request_in_app_enabled: true,
    p_friend_request_sound_enabled: false,
    p_friend_request_push_enabled: true,
    p_dm_in_app_enabled: Boolean(current.dm_in_app_enabled),
    p_dm_sound_enabled: Boolean(current.dm_sound_enabled),
    p_dm_push_enabled: Boolean(current.dm_push_enabled ?? true),
    p_mention_in_app_enabled: Boolean(current.mention_in_app_enabled),
    p_mention_sound_enabled: Boolean(current.mention_sound_enabled),
    p_mention_push_enabled: Boolean(current.mention_push_enabled ?? true),
  };

  await rpc(memberClient, 'update_my_notification_preferences', updateArgs);
  summary.actions.push('ensured member_a friend-request push preference is enabled');
}

function makeDummyBase64Url(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[(i * 17 + 13) % alphabet.length];
  }
  return out;
}

async function ensureRecipientSubscription(memberClient, memberId, summary) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const endpoint = `https://push.example.test/local-smoke/${memberId}/${suffix}`;
  const installationId = `local-smoke-${memberId}`;

  const data = await rpc(memberClient, 'upsert_my_web_push_subscription', {
    p_endpoint: endpoint,
    p_installation_id: installationId,
    p_p256dh_key: makeDummyBase64Url(87),
    p_auth_key: makeDummyBase64Url(24),
    p_expiration_time: null,
    p_user_agent: 'local-smoke-runner/1.0',
    p_client_platform: process.platform,
    p_app_display_mode: 'browser',
    p_metadata: {
      source: 'notification-smoke-script',
      installationId,
    },
  });

  const row = Array.isArray(data) ? data[0] : data;
  summary.subscription = {
    endpoint: row?.endpoint ?? endpoint,
    installationId: row?.installation_id ?? installationId,
    id: row?.id ?? null,
  };
  summary.actions.push('upserted dummy web push subscription for member_a');
}

async function clearPendingFriendRequestBetween(memberBClient, memberAId, summary) {
  const rows = await rpc(memberBClient, 'list_my_friend_requests');
  const items = Array.isArray(rows) ? rows : [];
  let cleared = 0;

  for (const item of items) {
    const isOutgoing = item?.direction === 'outgoing';
    const isPending = item?.status === 'pending';
    const matchesRecipient = item?.recipient_user_id === memberAId;
    const requestId = typeof item?.request_id === 'string' ? item.request_id : null;
    if (!isOutgoing || !isPending || !matchesRecipient || !requestId) continue;

    await rpc(memberBClient, 'cancel_friend_request', { p_request_id: requestId });
    cleared += 1;
  }

  if (cleared > 0) {
    summary.actions.push(`cleared ${cleared} pre-existing pending friend request(s) before smoke send`);
  }
}

async function sendFriendRequest(memberBClient, recipientUsername, summary) {
  const requestId = await rpc(memberBClient, 'send_friend_request', {
    p_username: recipientUsername,
  });
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw new Error('send_friend_request returned no request id.');
  }
  summary.friendRequestId = requestId;
  summary.actions.push(`sent friend request to ${recipientUsername}`);
  return requestId;
}

async function loadNotificationAndJobs(adminClient, requestId, recipientUserId) {
  const eventQuery = await adminClient
    .from('notification_events')
    .select('id, kind, source_id, actor_user_id, created_at')
    .eq('kind', 'friend_request_received')
    .eq('source_id', requestId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (eventQuery.error) throw eventQuery.error;
  const eventRow = eventQuery.data?.[0] ?? null;
  if (!eventRow) {
    throw new Error(`No friend_request_received notification_event row found for request ${requestId}.`);
  }

  const recipientQuery = await adminClient
    .from('notification_recipients')
    .select(
      'id, event_id, recipient_user_id, deliver_in_app, deliver_sound, read_at, dismissed_at, created_at'
    )
    .eq('event_id', eventRow.id)
    .eq('recipient_user_id', recipientUserId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (recipientQuery.error) throw recipientQuery.error;
  const recipientRow = recipientQuery.data?.[0] ?? null;
  if (!recipientRow) {
    throw new Error(`No notification_recipient row found for event ${eventRow.id}.`);
  }

  const jobsQuery = await adminClient
    .from('web_push_notification_jobs')
    .select(
      'id, status, attempts, notification_event_id, notification_recipient_id, provider_status_code, last_error, created_at, updated_at'
    )
    .eq('notification_recipient_id', recipientRow.id)
    .order('created_at', { ascending: false });
  if (jobsQuery.error) throw jobsQuery.error;

  return {
    event: eventRow,
    recipient: recipientRow,
    jobs: jobsQuery.data ?? [],
  };
}

async function listRecipientTraces(memberClient, recipientId) {
  const data = await rpc(memberClient, 'list_my_notification_delivery_traces', {
    p_limit: 40,
    p_notification_recipient_id: recipientId,
  });
  return Array.isArray(data) ? data : [];
}

async function listRecentBackendTraces(memberClient, limit) {
  const data = await rpc(memberClient, 'list_my_notification_delivery_traces', {
    p_limit: Math.max(1, Math.min(500, Math.trunc(limit || 100))),
    p_notification_recipient_id: null,
  });
  return Array.isArray(data) ? data : [];
}

async function loadWakeupDiagnostics(staffClient) {
  const data = await rpc(staffClient, 'get_web_push_dispatch_wakeup_diagnostics');
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

async function loadQueueHealthDiagnostics(staffClient) {
  const data = await rpc(staffClient, 'get_web_push_dispatch_queue_health_diagnostics');
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

function summarizeTraces(traces) {
  const byWakeSource = {};
  const byDecision = {};
  const byReason = {};

  for (const trace of traces) {
    const details = trace?.details && typeof trace.details === 'object' ? trace.details : {};
    const wakeSource =
      typeof details.wakeSource === 'string'
        ? details.wakeSource
        : typeof details.wake_source === 'string'
          ? details.wake_source
          : 'unknown';
    byWakeSource[wakeSource] = (byWakeSource[wakeSource] ?? 0) + 1;
    if (typeof trace.decision === 'string') {
      byDecision[trace.decision] = (byDecision[trace.decision] ?? 0) + 1;
    }
    if (typeof trace.reason_code === 'string') {
      byReason[trace.reason_code] = (byReason[trace.reason_code] ?? 0) + 1;
    }
  }

  return { byWakeSource, byDecision, byReason };
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function getRecordString(record, key) {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildBackendTraceParitySummary(traces) {
  const knownSources = ['shadow', 'cron', 'wakeup', 'manual'];
  const bySource = {};
  const reasonCountsBySource = {};

  for (const source of knownSources) {
    bySource[source] = { total: 0, send: 0, skip: 0, defer: 0 };
    reasonCountsBySource[source] = {};
  }

  for (const trace of traces) {
    if (trace?.transport !== 'web_push') continue;
    const details = asRecord(trace.details);
    const rawWakeSource = getRecordString(details, 'wakeSource') ?? getRecordString(details, 'wake_source') ?? 'unknown';
    const wakeSource = rawWakeSource.toLowerCase();
    if (!bySource[wakeSource]) {
      bySource[wakeSource] = { total: 0, send: 0, skip: 0, defer: 0 };
      reasonCountsBySource[wakeSource] = {};
    }

    bySource[wakeSource].total += 1;
    if (trace.decision === 'send') bySource[wakeSource].send += 1;
    else if (trace.decision === 'skip') bySource[wakeSource].skip += 1;
    else if (trace.decision === 'defer') bySource[wakeSource].defer += 1;

    const reasonCode =
      (typeof trace.reason_code === 'string' && trace.reason_code) ||
      (typeof trace.reasonCode === 'string' && trace.reasonCode) ||
      'unknown_reason';
    reasonCountsBySource[wakeSource][reasonCode] = (reasonCountsBySource[wakeSource][reasonCode] ?? 0) + 1;
  }

  const allReasons = new Set();
  for (const source of Object.keys(reasonCountsBySource)) {
    for (const reasonCode of Object.keys(reasonCountsBySource[source])) {
      allReasons.add(reasonCode);
    }
  }

  const topReasonComparisons = Array.from(allReasons)
    .map((reasonCode) => ({
      reasonCode,
      shadow: reasonCountsBySource.shadow?.[reasonCode] ?? 0,
      cron: reasonCountsBySource.cron?.[reasonCode] ?? 0,
      wakeup: reasonCountsBySource.wakeup?.[reasonCode] ?? 0,
      manual: reasonCountsBySource.manual?.[reasonCode] ?? 0,
    }))
    .filter((row) => row.shadow + row.cron + row.wakeup + row.manual > 0)
    .sort((a, b) => {
      const totalA = a.shadow + a.cron + a.wakeup + a.manual;
      const totalB = b.shadow + b.cron + b.wakeup + b.manual;
      if (totalB !== totalA) return totalB - totalA;
      return a.reasonCode.localeCompare(b.reasonCode);
    })
    .slice(0, 8);

  return { bySource, topReasonComparisons };
}

function buildBackendTraceParityDrift(paritySummary) {
  return (paritySummary?.topReasonComparisons ?? [])
    .map((row) => ({
      reasonCode: row.reasonCode,
      shadowMinusCron: row.shadow - row.cron,
      shadowMinusWakeup: row.shadow - row.wakeup,
    }))
    .filter((row) => row.shadowMinusCron !== 0 || row.shadowMinusWakeup !== 0)
    .sort((a, b) => {
      const magA = Math.abs(a.shadowMinusCron) + Math.abs(a.shadowMinusWakeup);
      const magB = Math.abs(b.shadowMinusCron) + Math.abs(b.shadowMinusWakeup);
      if (magB !== magA) return magB - magA;
      return a.reasonCode.localeCompare(b.reasonCode);
    })
    .slice(0, 8);
}

function buildQueueHealthAlerts(diagnostics) {
  if (!diagnostics) return [];

  const alerts = [];
  const push = (level, code, message) => {
    alerts.push({ level, code, message });
  };

  if ((diagnostics.processing_lease_expired_count ?? 0) > 0) {
    push(
      'critical',
      'processing_lease_expired',
      `${diagnostics.processing_lease_expired_count} processing job(s) have expired leases`
    );
  }

  if ((diagnostics.dead_letter_last_60m_count ?? 0) > 0) {
    push(
      'critical',
      'dead_letter_recent',
      `${diagnostics.dead_letter_last_60m_count} job(s) dead-lettered in the last 60 minutes`
    );
  }

  const oldestClaimable = diagnostics.oldest_claimable_age_seconds;
  if (typeof oldestClaimable === 'number') {
    if (oldestClaimable > 60) {
      push(
        'critical',
        'claimable_age_slo_breached',
        `oldest claimable job age ${oldestClaimable}s exceeds the critical threshold`
      );
    } else if (oldestClaimable > 10) {
      push(
        'warn',
        'claimable_age_above_target',
        `oldest claimable job age ${oldestClaimable}s exceeds the near-realtime target`
      );
    }
  }

  if ((diagnostics.retryable_due_now_count ?? 0) > 0) {
    push(
      'warn',
      'retryable_due_now_backlog',
      `${diagnostics.retryable_due_now_count} retryable-failed job(s) are due now`
    );
  }

  if ((diagnostics.high_retry_attempt_count ?? 0) > 0) {
    push(
      'warn',
      'high_retry_attempts',
      `${diagnostics.high_retry_attempt_count} retry/processing job(s) have 3+ attempts`
    );
  }

  if (
    (diagnostics.retryable_failed_last_10m_count ?? 0) > 0 &&
    (diagnostics.done_last_10m_count ?? 0) === 0
  ) {
    push(
      'warn',
      'retries_without_recent_success',
      'retryable failures in last 10m with no successful sends in the same window'
    );
  }

  return alerts;
}

async function tryInvokeWorker(memberClient, mode, maxJobs, summary) {
  try {
    const { data, error } = await memberClient.functions.invoke('web-push-worker', {
      body: { mode, maxJobs },
    });
    if (error) {
      summary.workerInvoke = {
        attempted: true,
        ok: false,
        mode,
        error: error.message || 'Unknown functions.invoke error',
      };
      return;
    }
    summary.workerInvoke = {
      attempted: true,
      ok: true,
      mode,
      stats: data ?? null,
    };
  } catch (error) {
    summary.workerInvoke = {
      attempted: true,
      ok: false,
      mode,
      error: formatUnknownError(error),
    };
  }
}

function printHumanSummary(summary) {
  console.log('');
  console.log('Notification Dispatch Smoke Summary');
  console.log('---------------------------------');
  console.log(`Status: ${summary.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Mode: ${summary.workerInvoke?.mode ?? 'none'}`);
  console.log(`Prepare: ${summary.options.prepare ? 'yes' : 'no'}`);
  console.log(`Worker invoked: ${summary.workerInvoke?.attempted ? 'yes' : 'no'}`);
  if (summary.workerInvoke?.attempted) {
    console.log(`Worker invoke ok: ${summary.workerInvoke.ok ? 'yes' : 'no'}`);
  }

  if (summary.actions.length) {
    console.log('');
    console.log('Actions');
    for (const line of summary.actions) {
      console.log(`- ${line}`);
    }
  }

  console.log('');
  console.log('Notification Rows');
  console.log(`- friendRequestId: ${summary.friendRequestId ?? 'n/a'}`);
  console.log(`- eventId: ${summary.notification?.event?.id ?? 'n/a'}`);
  console.log(`- recipientId: ${summary.notification?.recipient?.id ?? 'n/a'}`);
  console.log(`- queuedJobs: ${summary.notification?.jobs?.length ?? 0}`);

  if (summary.workerInvoke?.stats) {
    console.log('');
    console.log('Worker Stats');
    for (const [key, value] of Object.entries(summary.workerInvoke.stats)) {
      console.log(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  if (summary.wakeupDiagnostics) {
    console.log('');
    console.log('Wakeup Diagnostics');
    const wd = summary.wakeupDiagnostics;
    console.log(`- enabled: ${Boolean(wd.enabled)}`);
    console.log(`- shadow_mode: ${Boolean(wd.shadow_mode)}`);
    console.log(`- min_interval_seconds: ${wd.min_interval_seconds ?? 'n/a'}`);
    console.log(`- last_mode: ${wd.last_mode ?? 'n/a'}`);
    console.log(`- last_reason: ${wd.last_reason ?? 'n/a'}`);
    console.log(`- last_skip_reason: ${wd.last_skip_reason ?? 'n/a'}`);
    console.log(`- last_error: ${wd.last_error ?? 'n/a'}`);
    console.log(`- total_attempts: ${wd.total_attempts ?? 0}`);
    console.log(`- total_scheduled: ${wd.total_scheduled ?? 0}`);
    console.log(`- total_debounced: ${wd.total_debounced ?? 0}`);
  }

  if (summary.queueHealthDiagnostics) {
    const qh = summary.queueHealthDiagnostics;
    console.log('');
    console.log('Queue Health');
    console.log(`- claimable_now: ${qh.claimable_now_count ?? 0}`);
    console.log(`- pending: ${qh.total_pending ?? 0}`);
    console.log(`- retryable_failed: ${qh.total_retryable_failed ?? 0}`);
    console.log(`- processing: ${qh.total_processing ?? 0}`);
    console.log(`- done: ${qh.total_done ?? 0}`);
    console.log(`- dead_letter: ${qh.total_dead_letter ?? 0}`);
    console.log(`- oldest_claimable_age_seconds: ${qh.oldest_claimable_age_seconds ?? 'n/a'}`);
    console.log(`- retryable_due_now: ${qh.retryable_due_now_count ?? 0}`);
    console.log(`- processing_lease_expired: ${qh.processing_lease_expired_count ?? 0}`);
    console.log(`- dead_letter_last_60m: ${qh.dead_letter_last_60m_count ?? 0}`);
  }

  if (summary.queueHealthAlerts?.length) {
    console.log('');
    console.log('Queue Health Alerts');
    for (const alert of summary.queueHealthAlerts) {
      console.log(`- [${alert.level}] ${alert.code}: ${alert.message}`);
    }
  }

  if (summary.traceSummary) {
    console.log('');
    console.log('Trace Summary');
    console.log(`- byWakeSource: ${JSON.stringify(summary.traceSummary.byWakeSource)}`);
    console.log(`- byDecision: ${JSON.stringify(summary.traceSummary.byDecision)}`);
    console.log(`- byReason: ${JSON.stringify(summary.traceSummary.byReason)}`);
  }

  if (summary.backendParitySummary) {
    console.log('');
    console.log('Backend Parity Summary (recent traces)');
    console.log(`- bySource: ${JSON.stringify(summary.backendParitySummary.bySource)}`);
    console.log(
      `- topReasonComparisons: ${JSON.stringify(summary.backendParitySummary.topReasonComparisons)}`
    );
  }

  if (summary.backendParityDrift?.length) {
    console.log('');
    console.log('Backend Parity Drift');
    for (const row of summary.backendParityDrift) {
      console.log(
        `- ${row.reasonCode}: shadow-cron=${row.shadowMinusCron}, shadow-wakeup=${row.shadowMinusWakeup}`
      );
    }
  }

  if (summary.warnings.length) {
    console.log('');
    console.log('Warnings');
    for (const line of summary.warnings) {
      console.log(`- ${line}`);
    }
  }

  if (summary.failures.length) {
    console.log('');
    console.log('Failures');
    for (const line of summary.failures) {
      console.log(`- ${line}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const summary = {
    ok: false,
    options,
    startedAt: new Date().toISOString(),
    actions: [],
    warnings: [],
    failures: [],
    friendRequestId: null,
    subscription: null,
    notification: null,
    wakeupConfig: null,
    wakeupDiagnostics: null,
    queueHealthDiagnostics: null,
    queueHealthAlerts: [],
    workerInvoke: options.invokeWorker
      ? { attempted: false, ok: false, mode: options.workerMode }
      : { attempted: false, ok: false, mode: null },
    traces: [],
    traceSummary: null,
    recentBackendTraces: [],
    backendParitySummary: null,
    backendParityDrift: [],
  };

  try {
    if (options.prepare) {
      runPrepareFlow();
    }

    const env = resolveSupabaseLocalEnv();
    const fixtures = loadFixtureUsers();
    const adminClient = createSupabaseClient(env.API_URL, env.SERVICE_ROLE_KEY);

    const memberAClient = await signInFixtureUser(env.API_URL, env.ANON_KEY, fixtures.member_a, 'member_a');
    const memberBClient = await signInFixtureUser(env.API_URL, env.ANON_KEY, fixtures.member_b, 'member_b');
    const staffClient = await signInFixtureUser(
      env.API_URL,
      env.ANON_KEY,
      fixtures.platform_staff_active,
      'platform_staff_active'
    );

    await ensureWakupConfigAndCron(adminClient, staffClient, env, summary);
    await ensureRecipientNotificationPrefs(memberAClient, summary);
    await ensureRecipientSubscription(memberAClient, fixtures.member_a.id, summary);
    await clearPendingFriendRequestBetween(memberBClient, fixtures.member_a.id, summary);

    const requestId = await sendFriendRequest(memberBClient, fixtures.member_a.username, summary);
    summary.notification = await loadNotificationAndJobs(adminClient, requestId, fixtures.member_a.id);

    if (!summary.notification.jobs.length) {
      summary.failures.push('Expected at least one web_push_notification_jobs row, but found none.');
    }

    if (options.invokeWorker) {
      await tryInvokeWorker(memberAClient, options.workerMode, options.maxJobs, summary);
      if (!summary.workerInvoke.ok) {
        const msg =
          summary.workerInvoke.error ??
          'web-push-worker invoke failed (unknown error). Start `supabase functions serve web-push-worker --no-verify-jwt` for local shadow/manual runs.';
        if (options.strictWorker) {
          summary.failures.push(msg);
        } else {
          summary.warnings.push(
            `${msg} (continuing; run with --strict-worker to fail on worker invoke issues)`
          );
        }
      }
    }

    try {
      summary.traces = await listRecipientTraces(memberAClient, summary.notification.recipient.id);
      summary.traceSummary = summarizeTraces(summary.traces);
    } catch (error) {
      summary.warnings.push(
        `Unable to load recipient delivery traces (continuing): ${formatUnknownError(error)}`
      );
    }

    try {
      summary.recentBackendTraces = await listRecentBackendTraces(memberAClient, options.traceLimit);
      summary.backendParitySummary = buildBackendTraceParitySummary(summary.recentBackendTraces);
      summary.backendParityDrift = buildBackendTraceParityDrift(summary.backendParitySummary);
    } catch (error) {
      summary.warnings.push(
        `Unable to load recent backend traces for parity (continuing): ${formatUnknownError(error)}`
      );
    }

    try {
      summary.wakeupDiagnostics = await loadWakeupDiagnostics(staffClient);
    } catch (error) {
      summary.warnings.push(
        `Unable to load wakeup diagnostics (continuing): ${formatUnknownError(error)}`
      );
    }

    try {
      summary.queueHealthDiagnostics = await loadQueueHealthDiagnostics(staffClient);
      summary.queueHealthAlerts = buildQueueHealthAlerts(summary.queueHealthDiagnostics);
    } catch (error) {
      summary.warnings.push(
        `Unable to load queue health diagnostics (continuing): ${formatUnknownError(error)}`
      );
    }

    summary.ok = summary.failures.length === 0;
  } catch (error) {
    summary.failures.push(formatUnknownError(error));
    summary.ok = false;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printHumanSummary(summary);
  }

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[notif-smoke] Unhandled failure:', error);
  process.exitCode = 1;
});
