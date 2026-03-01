import {
    NotificationDeliveryTraceRecord,

  } from '@/lib/backend/types'
import {
    asRecord,
    getRecordString,
    
} from '@/shared/lib/records';

import type {
    WebPushDispatchQueueHealthDiagnostics,
    WebPushDispatchWakeupDiagnostics,
  } from '@/lib/backend/types';

const buildBackendWakeSourceCounts = (
  traces: NotificationDeliveryTraceRecord[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const trace of traces) {
    const details = asRecord(trace.details);
    const wakeSource = getRecordString(details, 'wakeSource') ?? 'unknown';
    counts[wakeSource] = (counts[wakeSource] ?? 0) + 1;
  }
  return counts;
};

const buildBackendTraceParitySummary = (
  traces: NotificationDeliveryTraceRecord[]
): WebPushBackendTraceParitySummary => {
  const knownSources = ['shadow', 'cron', 'wakeup', 'manual'] as const;
  const bySource: Record<string, WebPushBackendTraceParitySourceSummary> = {};
  const reasonCountsBySource: Record<string, Record<string, number>> = {};

  for (const source of knownSources) {
    bySource[source] = { total: 0, send: 0, skip: 0, defer: 0 };
    reasonCountsBySource[source] = {};
  }

  for (const trace of traces) {
    if (trace.transport !== 'web_push') continue;
    const details = asRecord(trace.details);
    const rawWakeSource = getRecordString(details, 'wakeSource') ?? 'unknown';
    const wakeSource = rawWakeSource.toLowerCase();
    if (!bySource[wakeSource]) {
      bySource[wakeSource] = { total: 0, send: 0, skip: 0, defer: 0 };
      reasonCountsBySource[wakeSource] = {};
    }

    const summary = bySource[wakeSource];
    summary.total += 1;
    if (trace.decision === 'send') summary.send += 1;
    else if (trace.decision === 'skip') summary.skip += 1;
    else if (trace.decision === 'defer') summary.defer += 1;

    const reasonCode = trace.reasonCode || 'unknown_reason';
    reasonCountsBySource[wakeSource][reasonCode] = (reasonCountsBySource[wakeSource][reasonCode] ?? 0) + 1;
  }

  const allReasons = new Set<string>();
  for (const source of knownSources) {
    for (const reasonCode of Object.keys(reasonCountsBySource[source] ?? {})) {
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
      const totalDiff =
        (b.shadow + b.cron + b.wakeup + b.manual) - (a.shadow + a.cron + a.wakeup + a.manual);
      if (totalDiff !== 0) return totalDiff;
      return a.reasonCode.localeCompare(b.reasonCode);
    })
    .slice(0, 8);

  return { bySource, topReasonComparisons };
};

const buildBackendTraceParityDrift = (
  summary: WebPushBackendTraceParitySummary
): WebPushBackendTraceParityDriftRow[] =>
  summary.topReasonComparisons
    .map((row) => ({
      reasonCode: row.reasonCode,
      shadowMinusCron: row.shadow - row.cron,
      shadowMinusWakeup: row.shadow - row.wakeup,
    }))
    .filter((row) => row.shadowMinusCron !== 0 || row.shadowMinusWakeup !== 0)
    .sort((a, b) => {
      const magnitudeA = Math.abs(a.shadowMinusCron) + Math.abs(a.shadowMinusWakeup);
      const magnitudeB = Math.abs(b.shadowMinusCron) + Math.abs(b.shadowMinusWakeup);
      if (magnitudeB !== magnitudeA) return magnitudeB - magnitudeA;
      return a.reasonCode.localeCompare(b.reasonCode);
    })
    .slice(0, 8);

const buildWebPushQueueHealthAlerts = (
  diagnostics: WebPushDispatchQueueHealthDiagnostics | null
): WebPushQueueHealthAlert[] => {
  if (!diagnostics) return [];

  const alerts: WebPushQueueHealthAlert[] = [];
  const pushAlert = (level: WebPushQueueHealthAlert['level'], code: string, message: string) => {
    alerts.push({ level, code, message });
  };

  if (diagnostics.processingLeaseExpiredCount > 0) {
    pushAlert(
      'critical',
      'processing_lease_expired',
      `${diagnostics.processingLeaseExpiredCount} processing job(s) have expired leases. Worker stalls or crashes may be leaving jobs stranded.`
    );
  }

  if (diagnostics.deadLetterLast60mCount > 0) {
    pushAlert(
      'critical',
      'dead_letter_recent',
      `${diagnostics.deadLetterLast60mCount} job(s) dead-lettered in the last 60 minutes. Investigate provider failures before cutover.`
    );
  }

  const oldestClaimable = diagnostics.oldestClaimableAgeSeconds;
  if (typeof oldestClaimable === 'number') {
    if (oldestClaimable > 60) {
      pushAlert(
        'critical',
        'claimable_age_slo_breached',
        `Oldest claimable job is ${oldestClaimable}s old (critical). Near-realtime cutover target (<10s p95) is not being met.`
      );
    } else if (oldestClaimable > 10) {
      pushAlert(
        'warn',
        'claimable_age_above_target',
        `Oldest claimable job is ${oldestClaimable}s old. This is above the near-realtime target and should be watched before cutover.`
      );
    }
  }

  if (diagnostics.retryableDueNowCount > 0) {
    pushAlert(
      'warn',
      'retryable_due_now_backlog',
      `${diagnostics.retryableDueNowCount} retryable-failed job(s) are due now. Retries are accumulating.`
    );
  }

  if (diagnostics.highRetryAttemptCount > 0) {
    pushAlert(
      'warn',
      'high_retry_attempts',
      `${diagnostics.highRetryAttemptCount} retry/processing job(s) have 3+ attempts. Error handling may still be unstable.`
    );
  }

  if (diagnostics.retryableFailedLast10mCount > 0 && diagnostics.doneLast10mCount === 0) {
    pushAlert(
      'warn',
      'retries_without_recent_success',
      `Retryable failures were recorded in the last 10 minutes without any successful sends in the same window.`
    );
  }

  return alerts;
};

const buildWebPushCutoverReadiness = (input: {
  wakeupState: WebPushDispatchWakeupDiagnostics | null;
  queueHealthAlerts: WebPushQueueHealthAlert[];
  backendParitySummary: WebPushBackendTraceParitySummary;
  backendParityDrift: WebPushBackendTraceParityDriftRow[];
}): WebPushCutoverReadiness => {
  const { wakeupState, queueHealthAlerts, backendParitySummary, backendParityDrift } = input;
  const details: string[] = [];
  const criticalAlerts = queueHealthAlerts.filter((alert) => alert.level === 'critical');
  const warnAlerts = queueHealthAlerts.filter((alert) => alert.level === 'warn');
  const shadowTraceCount = backendParitySummary.bySource.shadow?.total ?? 0;
  const cronTraceCount = backendParitySummary.bySource.cron?.total ?? 0;
  const wakeupTraceCount = backendParitySummary.bySource.wakeup?.total ?? 0;
  const parityDriftCount = backendParityDrift.length;

  if (!wakeupState) {
    return {
      status: 'blocked',
      summary: 'Wakeup scheduler diagnostics are unavailable. Cutover readiness cannot be evaluated.',
      details: ['Refresh diagnostics and verify staff access to wakeup diagnostics RPCs.'],
      recommendedAction: 'fix_alerts_first',
    };
  }

  if (criticalAlerts.length > 0) {
    details.push(...criticalAlerts.map((alert) => `${alert.code}: ${alert.message}`));
    if (!wakeupState.shadowMode) {
      return {
        status: 'blocked',
        summary:
          'Wakeup sends are active while critical queue-health alerts are present. Roll back to shadow mode before continuing.',
        details,
        recommendedAction: 'rollback_to_shadow',
      };
    }
    return {
      status: 'blocked',
      summary: 'Critical queue-health alerts are active. Do not start cutover rehearsal yet.',
      details,
      recommendedAction: 'fix_alerts_first',
    };
  }

  if (!wakeupState.enabled) {
    details.push('Immediate wakeup scheduler is disabled.');
    return {
      status: 'caution',
      summary:
        'Wakeup scheduler is disabled. Enable shadow wakeups first so parity and debounce behavior can be observed.',
      details,
      recommendedAction: 'enable_shadow_wakeups',
    };
  }

  if (!wakeupState.shadowMode) {
    if (warnAlerts.length > 0) {
      details.push(...warnAlerts.map((alert) => `${alert.code}: ${alert.message}`));
      return {
        status: 'caution',
        summary:
          'Wakeup sends are active and warning alerts are present. Continue monitoring and be ready to roll back to shadow mode.',
        details,
        recommendedAction: 'monitor_live_wakeup',
      };
    }
    if (parityDriftCount > 0) {
      details.push(
        `Parity drift detected across ${parityDriftCount} reason code(s) while wakeup sends are active. Review recent traces.`
      );
    }
    return {
      status: 'active',
      summary:
        'Wakeup send cutover is active (cron backstop remains). Continue monitoring queue health and parity drift.',
      details,
      recommendedAction: parityDriftCount > 0 ? 'monitor_live_wakeup' : 'monitor_live_wakeup',
    };
  }

  if (shadowTraceCount === 0) {
    details.push('No recent shadow traces found.');
    return {
      status: 'caution',
      summary:
        'Shadow wakeups are enabled, but there is not enough recent shadow trace data to compare against cron/manual behavior.',
      details,
      recommendedAction: 'collect_shadow_parity',
    };
  }

  if (cronTraceCount === 0 && wakeupTraceCount === 0) {
    details.push('No recent cron or wakeup traces found for parity comparison.');
    return {
      status: 'caution',
      summary:
        'Shadow traces exist, but there is no recent cron/wakeup trace baseline yet. Let the system run longer before cutover rehearsal.',
      details,
      recommendedAction: 'collect_shadow_parity',
    };
  }

  if (parityDriftCount > 0) {
    details.push(
      ...backendParityDrift
        .slice(0, 3)
        .map(
          (row) =>
            `${row.reasonCode}: shadow-cron=${row.shadowMinusCron}, shadow-wakeup=${row.shadowMinusWakeup}`
        )
    );
    return {
      status: 'caution',
      summary:
        'Shadow-vs-cron/wakeup parity drift is present. Review traces before enabling real wakeup sends.',
      details,
      recommendedAction: 'collect_shadow_parity',
    };
  }

  if (warnAlerts.length > 0) {
    details.push(...warnAlerts.map((alert) => `${alert.code}: ${alert.message}`));
    return {
      status: 'caution',
      summary:
        'No critical blockers, but warning alerts are active. A staging cutover rehearsal is possible with close monitoring.',
      details,
      recommendedAction: 'start_cutover_rehearsal',
    };
  }

  return {
    status: 'ready',
    summary:
      'Queue health and parity checks look good. This environment is ready for a controlled wakeup cutover rehearsal.',
    details: [
      `Shadow traces: ${shadowTraceCount}`,
      `Cron traces: ${cronTraceCount}`,
      `Wakeup traces: ${wakeupTraceCount}`,
    ],
    recommendedAction: 'start_cutover_rehearsal',
  };
};

type WebPushRouteDiagnosticsSnapshot = {
  mode: 'real' | 'simulated_push' | 'hybrid';
  decision: {
    routeMode: string;
    reasonCodes: string[];
  };
  localTraces: NotificationDeliveryTraceRecord[];
};

type WebPushBackendTraceParitySourceSummary = {
  total: number;
  send: number;
  skip: number;
  defer: number;
};

type WebPushBackendTraceParitySummary = {
  bySource: Record<string, WebPushBackendTraceParitySourceSummary>;
  topReasonComparisons: Array<{
    reasonCode: string;
    shadow: number;
    cron: number;
    wakeup: number;
    manual: number;
  }>;
};

type WebPushBackendTraceParityDriftRow = {
  reasonCode: string;
  shadowMinusCron: number;
  shadowMinusWakeup: number;
};

type WebPushQueueHealthAlert = {
  level: 'warn' | 'critical';
  code: string;
  message: string;
};

type WebPushCutoverReadiness = {
  status: 'ready' | 'caution' | 'blocked' | 'active';
  summary: string;
  details: string[];
  recommendedAction:
    | 'fix_alerts_first'
    | 'collect_shadow_parity'
    | 'enable_shadow_wakeups'
    | 'start_cutover_rehearsal'
    | 'monitor_live_wakeup'
    | 'rollback_to_shadow';
};

export {
  WebPushRouteDiagnosticsSnapshot,
  WebPushBackendTraceParitySourceSummary,
  WebPushCutoverReadiness,
  WebPushBackendTraceParitySummary,
  WebPushBackendTraceParityDriftRow,
  WebPushQueueHealthAlert,
  buildBackendTraceParityDrift,
  buildBackendTraceParitySummary,
  buildBackendWakeSourceCounts,
  buildWebPushCutoverReadiness,
  buildWebPushQueueHealthAlerts,
}