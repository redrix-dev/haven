import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginScreen } from '@/components/LoginScreen';
import { ServerList } from '@/components/ServerList';
import { CreateServerModal } from '@/components/CreateServerModal';
import { CreateChannelModal } from '@/components/CreateChannelModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
import { QuickRenameDialog } from '@/components/QuickRenameDialog';
import { ServerMembersModal } from '@/components/ServerMembersModal';
import {
  ServerSettingsModal,
} from '@/components/ServerSettingsModal';
import {
  ChannelSettingsModal,
} from '@/components/ChannelSettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { VoiceChannelPane } from '@/components/VoiceChannelPane';
import { VoiceHardwareDebugPanel } from '@/components/VoiceHardwareDebugPanel';
import { VoiceSettingsModal } from '@/components/VoiceSettingsModal';
import { NotificationCenterModal } from '@/components/NotificationCenterModal';
import { FriendsModal } from '@/components/FriendsModal';
import { DirectMessagesSidebar } from '@/components/DirectMessagesSidebar';
import { DirectMessageArea } from '@/components/DirectMessageArea';
import { DmReportReviewPanel } from '@/components/DmReportReviewPanel';
import { PasswordRecoveryDialog } from '@/components/PasswordRecoveryDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useServers } from '@/lib/hooks/useServers';
import {
  getCommunityDataBackend,
  getControlPlaneBackend,
  getDirectMessageBackend,
  getNotificationBackend,
  getSocialBackend,
} from '@/lib/backend';
import { desktopClient } from '@/shared/desktop/client';
import { getPlatformInviteBaseUrl } from '@/shared/platform/urls';
import { getErrorMessage } from '@/shared/lib/errors';
import { recordLocalNotificationDeliveryTrace } from '@/lib/notifications/devTrace';
import { installPromptTrap } from '@/lib/contextMenu/debugTrace';
import {
  DEFAULT_APP_SETTINGS,
  DM_REPORT_REVIEW_PANEL_FLAG,
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  FRIENDS_SOCIAL_PANEL_FLAG,
  MESSAGE_PAGE_SIZE,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
  VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL,
} from '@/renderer/app/constants';
import type {
  PendingUiConfirmation,
} from '@/renderer/app/types';
import { getPendingUiConfirmationCopy } from '@/renderer/app/ui-confirmations';
import { useDesktopSettings } from '@/renderer/features/desktop/hooks/useDesktopSettings';
import { useCommunityWorkspace } from '@/renderer/features/community/hooks/useCommunityWorkspace';
import { useServerAdmin } from '@/renderer/features/community/hooks/useServerAdmin';
import { useChannelManagement } from '@/renderer/features/community/hooks/useChannelManagement';
import { useChannelGroups } from '@/renderer/features/community/hooks/useChannelGroups';
import { useMessages } from '@/renderer/features/messages/hooks/useMessages';
import { useNotifications } from '@/renderer/features/notifications/hooks/useNotifications';
import { useNotificationInteractions } from '@/renderer/features/notifications/hooks/useNotificationInteractions';
import { useSocialWorkspace } from '@/renderer/features/social/hooks/useSocialWorkspace';
import { useDirectMessages } from '@/renderer/features/direct-messages/hooks/useDirectMessages';
import { useDirectMessageInteractions } from '@/renderer/features/direct-messages/hooks/useDirectMessageInteractions';
import { useVoice } from '@/renderer/features/voice/hooks/useVoice';
import { useFeatureFlags } from '@/renderer/features/session/hooks/useFeatureFlags';
import { usePlatformSession } from '@/renderer/features/session/hooks/usePlatformSession';
import type {
  AuthorProfile,
  BanEligibleServer,
  Channel,
  ChannelKind,
  NotificationDeliveryTraceRecord,
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupDiagnostics,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  Message,
} from '@/lib/backend/types';
import type { HavenWebPushClientStatus } from '@/web/pwa/webPushClient';
import { Headphones, Mic, MicOff, PhoneOff, Settings2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

type WebAppDeepLinkTarget =
  | { kind: 'invite'; inviteCode: string }
  | { kind: 'dm_message'; conversationId: string }
  | { kind: 'friend_request_received'; friendRequestId: string | null }
  | { kind: 'friend_request_accepted' }
  | { kind: 'channel_mention'; communityId: string; channelId: string };

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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getRecordString = (record: Record<string, unknown> | null, key: string): string | null => {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const normalizeDeepLinkPathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

const getMergedUrlParams = (parsed: URL): URLSearchParams => {
  const merged = new URLSearchParams();

  const apply = (params: URLSearchParams) => {
    for (const [key, value] of params.entries()) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  };

  apply(parsed.searchParams);
  if (parsed.hash.startsWith('#')) {
    const rawHash = parsed.hash.slice(1);
    if (rawHash.startsWith('?')) {
      apply(new URLSearchParams(rawHash.slice(1)));
    }
  }

  return merged;
};

const parseNotificationTargetFromUrl = (parsed: URL): WebAppDeepLinkTarget | null => {
  const pathname = normalizeDeepLinkPathname(parsed.pathname);
  const params = getMergedUrlParams(parsed);

  if (pathname === '/auth/confirm') {
    return null;
  }

  if (pathname === '/invite') {
    const inviteCode = params.get('code')?.trim() ?? params.get('invite')?.trim() ?? '';
    return inviteCode ? { kind: 'invite', inviteCode } : null;
  }

  if (pathname.startsWith('/invite/')) {
    const inviteCode = pathname.slice('/invite/'.length).trim();
    return inviteCode ? { kind: 'invite', inviteCode } : null;
  }

  const target =
    params.get('target')?.trim().toLowerCase() ??
    params.get('open')?.trim().toLowerCase() ??
    null;
  const rawKind =
    params.get('kind')?.trim().toLowerCase() ??
    params.get('notificationKind')?.trim().toLowerCase() ??
    target;

  const conversationId = params.get('conversationId')?.trim() ?? null;
  const friendRequestId = params.get('friendRequestId')?.trim() ?? null;
  const communityId = params.get('communityId')?.trim() ?? null;
  const channelId = params.get('channelId')?.trim() ?? null;

  if (rawKind === 'dm' || rawKind === 'dm_message') {
    return conversationId ? { kind: 'dm_message', conversationId } : null;
  }

  if (
    rawKind === 'friend_requests' ||
    rawKind === 'friend_request_received' ||
    rawKind === 'requests'
  ) {
    return { kind: 'friend_request_received', friendRequestId };
  }

  if (rawKind === 'friends' || rawKind === 'friend_request_accepted') {
    return { kind: 'friend_request_accepted' };
  }

  if (
    rawKind === 'channel' ||
    rawKind === 'mention' ||
    rawKind === 'channel_mention'
  ) {
    return communityId && channelId
      ? { kind: 'channel_mention', communityId, channelId }
      : null;
  }

  return null;
};

const parseWebAppDeepLinkUrl = (url: string): WebAppDeepLinkTarget | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parseNotificationTargetFromUrl(parsed);
  } catch {
    return null;
  }
};

const parseWebPushClickPayloadTarget = (payload: unknown): WebAppDeepLinkTarget | null => {
  const root = asRecord(payload);
  if (!root) return null;

  const nestedPayload = asRecord(root.payload);
  const data = asRecord(root.data);
  const notification = asRecord(root.notification);
  const notificationData = asRecord(notification?.data);
  const records = [root, nestedPayload, data, notificationData];

  for (const record of records) {
    const candidateUrl = getRecordString(record, 'url') ?? getRecordString(record, 'path');
    if (candidateUrl) {
      const fromUrl = parseWebAppDeepLinkUrl(candidateUrl);
      if (fromUrl) return fromUrl;
    }
  }

  const kind =
    records
      .map((record) => getRecordString(record, 'kind') ?? getRecordString(record, 'notificationKind'))
      .find(Boolean)
      ?.toLowerCase() ?? null;

  const conversationId = records.map((record) => getRecordString(record, 'conversationId')).find(Boolean) ?? null;
  const friendRequestId = records.map((record) => getRecordString(record, 'friendRequestId')).find(Boolean) ?? null;
  const communityId = records.map((record) => getRecordString(record, 'communityId')).find(Boolean) ?? null;
  const channelId = records.map((record) => getRecordString(record, 'channelId')).find(Boolean) ?? null;

  switch (kind) {
    case 'dm_message':
      return conversationId ? { kind: 'dm_message', conversationId } : null;
    case 'friend_request_received':
      return { kind: 'friend_request_received', friendRequestId };
    case 'friend_request_accepted':
      return { kind: 'friend_request_accepted' };
    case 'channel_mention':
      return communityId && channelId ? { kind: 'channel_mention', communityId, channelId } : null;
    default:
      return null;
  }
};

const WEB_DEEP_LINK_DEDUPE_WINDOW_MS = 5000;

const safeStableStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return '[unserializable]';
  }
};

export function ChatApp() {
  const controlPlaneBackend = getControlPlaneBackend();
  const directMessageBackend = getDirectMessageBackend();
  const notificationBackend = getNotificationBackend();
  const socialBackend = getSocialBackend();
  const {
    user,
    status: authStatus,
    error: authError,
    passwordRecoveryRequired,
    completePasswordRecovery,
    signOut,
    deleteAccount,
  } = useAuth();
  const {
    servers,
    status: serversStatus,
    error: serversError,
    createServer,
    refreshServers,
  } = useServers();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showChannelSettingsModal, setShowChannelSettingsModal] = useState(false);
  const [channelSettingsTargetId, setChannelSettingsTargetId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showVoiceSettingsModal, setShowVoiceSettingsModal] = useState(false);
  const [userVoiceHardwareTestOpen, setUserVoiceHardwareTestOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachment[]>([]);
  const [messageLinkPreviews, setMessageLinkPreviews] = useState<MessageLinkPreview[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});
  const {
    state: { featureFlags },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({
    controlPlaneBackend,
    userId: user?.id,
  });
  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS || hasFeatureFlag('debug_channel_reload_diagnostics');
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(VOICE_HARDWARE_DEBUG_PANEL_FLAG);
  const {
    state: {
      profileUsername,
      profileAvatarUrl,
      isPlatformStaff,
      platformStaffPrefix,
      canPostHavenDevMessage,
    },
    actions: { resetPlatformSession, applyLocalProfileUpdate },
  } = usePlatformSession({
    controlPlaneBackend,
    userId: user?.id,
    userEmail: user?.email,
  });
  const [canSendHavenDeveloperMessage, setCanSendHavenDeveloperMessage] = useState(false);
  const [dmReportReviewPanelOpen, setDmReportReviewPanelOpen] = useState(false);
  const {
    state: {
      channels,
      channelsLoading,
      channelsError,
      currentChannelId,
      currentServerId,
      serverPermissions,
    },
    derived: {
      currentServer,
      currentChannel,
      channelSettingsTarget,
      currentRenderableChannel,
      currentChannelKind,
    },
    actions: {
      resetChannelsWorkspace,
      setChannels,
      setCurrentChannelId,
      setCurrentServerId,
      resetServerPermissions,
    },
  } = useCommunityWorkspace({
    servers,
    currentUserId: user?.id ?? null,
    channelSettingsTargetId,
  });
  const {
    state: {
      activeVoiceChannelId,
      voicePanelOpen,
      voiceHardwareDebugPanelOpen,
      voiceConnected,
      voiceParticipants,
      voiceSessionState,
      canSpeakInVoiceChannel,
      voiceControlActions,
      voiceJoinPrompt,
    },
    derived: {
      activeVoiceChannel,
      voiceChannelParticipants,
      activeVoiceParticipantCount,
    },
    actions: {
      setVoicePanelOpen,
      setVoiceHardwareDebugPanelOpen,
      setVoiceConnected,
      setVoiceParticipants,
      setVoiceSessionState,
      setVoiceControlActions,
      resetVoiceState,
      requestVoiceChannelJoin,
      confirmVoiceChannelJoin,
      cancelVoiceChannelJoinPrompt,
      disconnectVoiceSession,
    },
  } = useVoice({
    currentServerId,
    currentUserId: user?.id,
    currentUserDisplayName:
      (isPlatformStaff
        ? `${platformStaffPrefix ?? 'Haven'}-${profileUsername || user?.email?.split('@')[0] || 'User'}`
        : profileUsername || user?.email?.split('@')[0] || 'User'),
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled,
    channels,
  });
  const [renameServerDraft, setRenameServerDraft] = useState<{ serverId: string; currentName: string } | null>(
    null
  );
  const [renameChannelDraft, setRenameChannelDraft] = useState<{ channelId: string; currentName: string } | null>(
    null
  );
  const [renameGroupDraft, setRenameGroupDraft] = useState<{ groupId: string; currentName: string } | null>(null);
  const [createGroupDraft, setCreateGroupDraft] = useState<{ channelId: string | null } | null>(null);
  const [pendingUiConfirmation, setPendingUiConfirmation] = useState<PendingUiConfirmation | null>(
    null
  );
  const {
    state: { channelGroupState },
    actions: {
      resetChannelGroups,
      refreshChannelGroupsState,
      createChannelGroup,
      assignChannelToGroup,
      removeChannelFromGroup,
      setChannelGroupCollapsed,
      renameChannelGroup,
      deleteChannelGroup,
    },
  } = useChannelGroups({
    currentServerId,
    currentUserId: user?.id ?? null,
    channels,
  });
  const {
    state: {
      showMembersModal,
      membersModalCommunityId,
      membersModalServerName,
      membersModalMembers,
      membersModalLoading,
      membersModalError,
      membersModalCanCreateReports,
      membersModalCanManageBans,
      communityBans,
      communityBansLoading,
      communityBansError,
      serverInvites,
      serverInvitesLoading,
      serverInvitesError,
      serverRoles,
      serverMembers,
      serverPermissionCatalog,
      serverRoleManagementLoading,
      serverRoleManagementError,
      serverSettingsInitialValues,
      serverSettingsLoading,
      serverSettingsLoadError,
    },
    actions: {
      resetMembersModal,
      closeMembersModal,
      openServerMembersModal,
      refreshMembersModalMembersIfOpen,
      resetCommunityBans,
      loadCommunityBans,
      unbanUserFromCurrentServer,
      resetServerInvites,
      loadServerInvites,
      createServerInvite,
      revokeServerInvite,
      resetServerRoleManagement,
      loadServerRoleManagement,
      createServerRole,
      updateServerRole,
      deleteServerRole,
      saveServerRolePermissions,
      saveServerMemberRoles,
      resetServerSettingsState,
      saveServerSettings,
      openServerSettingsModal,
      leaveServer,
      deleteServer,
      renameServer,
    },
  } = useServerAdmin({
    servers,
    controlPlaneBackend,
    currentServerId,
    currentUserId: user?.id ?? null,
    canManageDeveloperAccess: serverPermissions.canManageDeveloperAccess,
    canManageInvites: serverPermissions.canManageInvites,
    isServerSettingsModalOpen: showServerSettingsModal,
    setCurrentServerId,
    setShowServerSettingsModal,
    refreshServers,
    onActiveServerRemoved: () => {
      setCurrentServerId(null);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
    },
  });
  const {
    state: {
      channelRolePermissions,
      channelMemberPermissions,
      channelPermissionMemberOptions,
      channelPermissionsLoading,
      channelPermissionsLoadError,
    },
    actions: {
      resetChannelPermissionsState,
      createChannel,
      saveChannelSettings,
      renameChannel,
      deleteChannel,
      deleteCurrentChannel,
      openChannelSettingsModal,
      saveRoleChannelPermissions,
      saveMemberChannelPermissions,
    },
  } = useChannelManagement({
    currentServerId,
    currentUserId: user?.id ?? null,
    currentChannelId,
    channelSettingsTargetId,
    channels,
    setChannels,
    setCurrentChannelId,
    setChannelSettingsTargetId,
    setShowChannelSettingsModal,
  });
  const {
    state: { hasOlderMessages, isLoadingOlderMessages },
    actions: {
      resetMessageState,
      requestOlderMessages,
      sendMessage,
      toggleMessageReaction,
      editMessage,
      deleteMessage,
      reportMessage,
      requestMessageLinkPreviewRefresh,
    },
  } = useMessages({
    currentServerId,
    currentChannelId,
    currentUserId: user?.id ?? null,
    debugChannelReloads,
    channels,
    setMessages,
    setMessageReactions,
    setMessageAttachments,
    setMessageLinkPreviews,
    setAuthorProfiles,
    authorProfileCacheRef,
  });
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [webPushStatus, setWebPushStatus] = useState<HavenWebPushClientStatus | null>(null);
  const [webPushStatusLoading, setWebPushStatusLoading] = useState(false);
  const [webPushActionBusy, setWebPushActionBusy] = useState(false);
  const [webPushStatusError, setWebPushStatusError] = useState<string | null>(null);
  const [webPushTestBusy, setWebPushTestBusy] = useState(false);
  const [webPushTestError, setWebPushTestError] = useState<string | null>(null);
  const [webPushTestLastResult, setWebPushTestLastResult] = useState<string | null>(null);
  const [webPushDiagnosticsLoading, setWebPushDiagnosticsLoading] = useState(false);
  const [webPushDiagnosticsError, setWebPushDiagnosticsError] = useState<string | null>(null);
  const [webPushRouteDiagnostics, setWebPushRouteDiagnostics] =
    useState<WebPushRouteDiagnosticsSnapshot | null>(null);
  const [webPushBackendTraces, setWebPushBackendTraces] = useState<NotificationDeliveryTraceRecord[]>([]);
  const [webPushQueueHealthDiagnostics, setWebPushQueueHealthDiagnostics] =
    useState<WebPushDispatchQueueHealthDiagnostics | null>(null);
  const [webPushWakeupDiagnostics, setWebPushWakeupDiagnostics] =
    useState<WebPushDispatchWakeupDiagnostics | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'community' | 'dm'>('community');
  const {
    state: {
      appSettings,
      appSettingsLoading,
      updaterStatus,
      updaterStatusLoading,
      checkingForUpdates,
      notificationAudioSettingsSaving,
      notificationAudioSettingsError,
      voiceSettingsSaving,
      voiceSettingsError,
    },
    actions: {
      setAutoUpdateEnabled,
      setNotificationAudioSettings,
      setVoiceSettings,
      checkForUpdatesNow,
    },
  } = useDesktopSettings();
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;
  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === 'dm';
  const dmReportReviewPanelEnabled = isPlatformStaff && hasFeatureFlag(DM_REPORT_REVIEW_PANEL_FLAG);
  const webPushTestToolsEnabled =
    !desktopClient.isAvailable() &&
    (isPlatformStaff || process.env.NODE_ENV === 'development');
  const {
    state: {
      notificationItems,
      notificationCounts,
      notificationsLoading,
      notificationsRefreshing,
      notificationsError,
      notificationPreferences,
      notificationPreferencesLoading,
      notificationPreferencesSaving,
      notificationPreferencesError,
    },
    actions: {
      resetNotifications,
      refreshNotificationInbox,
      saveNotificationPreferences,
      refreshNotificationsManually,
      markAllNotificationsSeen,
      markNotificationRead,
      dismissNotification,
      setNotificationsError,
    },
  } = useNotifications({
    notificationBackend,
    userId: user?.id,
    notificationsPanelOpen,
    audioSettings: appSettings.notifications,
  });
  const {
    state: {
      friendsPanelOpen,
      friendsPanelRequestedTab,
      friendsPanelHighlightedRequestId,
      socialCounts,
    },
    actions: {
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setFriendsPanelHighlightedRequestId,
      refreshSocialCounts,
      resetSocialWorkspace,
    },
  } = useSocialWorkspace({
    socialBackend,
    userId: user?.id,
    enabled: friendsSocialPanelEnabled,
  });
  const {
    state: {
      dmConversations,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmConversationsError,
      selectedDmConversationId,
      dmMessages,
      dmMessagesLoading,
      dmMessagesRefreshing,
      dmMessagesError,
      dmMessageSendPending,
    },
    actions: {
      resetDirectMessages,
      clearSelectedDmConversation,
      refreshDmConversations,
      refreshDmMessages,
      setSelectedDmConversationId,
      setDmConversationsError,
      openDirectMessageConversation,
      openDirectMessageWithUser,
      sendDirectMessage,
      toggleSelectedDmConversationMuted,
      reportDirectMessage,
    },
  } = useDirectMessages({
    directMessageBackend,
    userId: user?.id,
    enabled: dmWorkspaceEnabled,
    isActive: dmWorkspaceIsActive,
  });
  const {
    actions: {
      openDirectMessagesWorkspace,
      directMessageUser,
      blockDirectMessageUser,
    },
  } = useDirectMessageInteractions({
    dmWorkspaceEnabled,
    friendsSocialPanelEnabled,
    currentUserId: user?.id,
    selectedDmConversationId,
    dmConversations,
    setSelectedDmConversationId,
    setDmConversationsError,
    refreshDmConversations,
    openDirectMessageWithUser,
    clearSelectedDmConversation,
    socialBackend,
    refreshSocialCounts,
    refreshNotificationInbox,
    onOpenDmWorkspace: () => {
      setWorkspaceMode('dm');
      setNotificationsPanelOpen(false);
      setFriendsPanelOpen(false);
      setFriendsPanelRequestedTab(null);
      setFriendsPanelHighlightedRequestId(null);
    },
    onEnterDmWorkspace: () => {
      setWorkspaceMode('dm');
    },
    onOpenFriendsAddPanel: () => {
      setFriendsPanelRequestedTab('add');
      setFriendsPanelHighlightedRequestId(null);
      setFriendsPanelOpen(true);
    },
  });
  const {
    actions: {
      openNotificationItem,
      acceptFriendRequestFromNotification,
      declineFriendRequestFromNotification,
    },
  } = useNotificationInteractions({
    notificationBackend,
    socialBackend,
    friendsSocialPanelEnabled,
    refreshNotificationInbox,
    refreshSocialCounts,
    setNotificationsError,
    onOpenDmConversation: async (conversationId) => {
      setWorkspaceMode('dm');
      await openDirectMessageConversation(conversationId);
      setNotificationsPanelOpen(false);
    },
    onOpenFriendsPanel: ({ tab, highlightedRequestId }) => {
      setFriendsPanelRequestedTab(tab);
      setFriendsPanelHighlightedRequestId(highlightedRequestId);
      setFriendsPanelOpen(true);
      setNotificationsPanelOpen(false);
    },
    onOpenChannelMention: ({ communityId, channelId }) => {
      setWorkspaceMode('community');
      setCurrentServerId(communityId);
      setCurrentChannelId(channelId);
      setNotificationsPanelOpen(false);
    },
  });
  const processedWebDeepLinkKeysRef = useRef<Map<string, number>>(new Map());
  const pendingWebDeepLinkRef = useRef<{
    target: WebAppDeepLinkTarget;
    clearBrowserUrlAfterOpen: boolean;
    dedupeKey: string | null;
  } | null>(null);
  const loadWebPushModules = React.useCallback(async () => {
    if (desktopClient.isAvailable()) return null;

    const [serviceWorkerModule, webPushClientModule] = await Promise.all([
      import('@/web/pwa/registerServiceWorker'),
      import('@/web/pwa/webPushClient'),
    ]);

    return { serviceWorkerModule, webPushClientModule };
  }, []);

  const setWebPushTestResult = React.useCallback((label: string, details: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const body =
      typeof details === 'string'
        ? details
        : safeStableStringify(details);
    setWebPushTestLastResult(`[${timestamp}] ${label}\n${body}`);
  }, []);

  const refreshWebPushStatus = React.useCallback(async () => {
    if (desktopClient.isAvailable()) {
      setWebPushStatus(null);
      setWebPushStatusError(null);
      setWebPushStatusLoading(false);
      return;
    }

    setWebPushStatusLoading(true);
    setWebPushStatusError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;
      const status = await modules.webPushClientModule.getHavenWebPushClientStatus();
      setWebPushStatus(status);
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to load web push status.'));
    } finally {
      setWebPushStatusLoading(false);
    }
  }, [loadWebPushModules]);

  const refreshWebPushDiagnostics = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) {
      setWebPushRouteDiagnostics(null);
      setWebPushBackendTraces([]);
      setWebPushQueueHealthDiagnostics(null);
      setWebPushWakeupDiagnostics(null);
      setWebPushDiagnosticsError(null);
      setWebPushDiagnosticsLoading(false);
      return;
    }

    setWebPushDiagnosticsLoading(true);
    setWebPushDiagnosticsError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      const [routeDiagnostics, backendTraces, queueHealthDiagnostics, wakeupDiagnostics] =
        await Promise.all([
          modules.webPushClientModule.getHavenNotificationRouteDiagnostics(),
          notificationBackend.listNotificationDeliveryTraces({ limit: 100 }),
          notificationBackend.getWebPushDispatchQueueHealthDiagnostics().catch(() => null),
          notificationBackend.getWebPushDispatchWakeupDiagnostics(),
        ]);

      setWebPushRouteDiagnostics({
        mode: routeDiagnostics.mode,
        decision: {
          routeMode: routeDiagnostics.decision.routeMode,
          reasonCodes: routeDiagnostics.decision.reasonCodes,
        },
        localTraces: routeDiagnostics.localTraces as unknown as NotificationDeliveryTraceRecord[],
      });
      setWebPushBackendTraces(backendTraces);
      setWebPushQueueHealthDiagnostics(queueHealthDiagnostics);
      setWebPushWakeupDiagnostics(wakeupDiagnostics);
    } catch (error) {
      setWebPushDiagnosticsError(getErrorMessage(error, 'Failed to load delivery diagnostics.'));
    } finally {
      setWebPushDiagnosticsLoading(false);
    }
  }, [loadWebPushModules, notificationBackend, webPushTestToolsEnabled]);

  const setWebPushNotificationDevMode = React.useCallback(
    async (mode: 'real' | 'simulated_push' | 'hybrid') => {
      if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
      const modules = await loadWebPushModules();
      if (!modules) return;
      modules.webPushClientModule.setHavenNotificationDevMode(mode);
      await refreshWebPushDiagnostics();
      setWebPushTestResult('Set Notification Dev Mode', { mode });
    },
    [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const setNotificationRouteSimulationFocus = React.useCallback(
    async (hasFocus: boolean) => {
      if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
      const modules = await loadWebPushModules();
      if (!modules) return;
      modules.webPushClientModule.setHavenNotificationRouteSimulationOverrides({ hasFocus });
      const trace = modules.webPushClientModule.simulateHavenNotificationRouteDecisionTrace();
      setWebPushTestResult(hasFocus ? 'Simulate Focused Route' : 'Simulate Background Route', trace);
      await refreshWebPushDiagnostics();
    },
    [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const clearNotificationRouteSimulation = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    const modules = await loadWebPushModules();
    if (!modules) return;
    modules.webPushClientModule.clearHavenNotificationRouteSimulationOverrides();
    await refreshWebPushDiagnostics();
    setWebPushTestResult('Clear Route Simulation', { ok: true });
  }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const recordNotificationRouteSimulationTrace = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    const modules = await loadWebPushModules();
    if (!modules) return;
    const trace = modules.webPushClientModule.simulateHavenNotificationRouteDecisionTrace();
    setWebPushTestResult('Record Route Trace', trace);
    await refreshWebPushDiagnostics();
  }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const clearLocalNotificationTraces = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    const modules = await loadWebPushModules();
    if (!modules) return;
    modules.webPushClientModule.clearHavenNotificationRouteDiagnostics();
    setWebPushTestResult('Clear Local Notification Traces', { ok: true });
    await refreshWebPushDiagnostics();
  }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const enableWebPushOnThisDevice = React.useCallback(async () => {
    if (desktopClient.isAvailable()) return;

    setWebPushActionBusy(true);
    setWebPushStatusError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
      modules.webPushClientModule.enableHavenWebPushSync();

      const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
      await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);

      const statusBeforePermission = await modules.webPushClientModule.getHavenWebPushClientStatus();
      setWebPushStatus(statusBeforePermission);

      if (!statusBeforePermission.vapidPublicKeyConfigured) {
        throw new Error('Web push VAPID public key is not configured for this web build.');
      }

      if (!statusBeforePermission.secureContext) {
        throw new Error('Web push requires HTTPS (or localhost).');
      }

      const permission = await modules.webPushClientModule.requestHavenWebPushPermissionAndSync();
      if (permission === 'denied') {
        toast.error('Browser notifications are blocked for this site. Enable them in browser settings.', {
          id: 'web-push-permission-denied',
        });
      } else if (permission === 'granted') {
        toast.success('Web push enabled for this device.', { id: 'web-push-enabled' });
      }
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to enable web push on this device.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushActionBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus]);

  const syncWebPushNow = React.useCallback(async () => {
    if (desktopClient.isAvailable()) return;

    setWebPushActionBusy(true);
    setWebPushStatusError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
      modules.webPushClientModule.enableHavenWebPushSync();

      const statusBeforeSync = await modules.webPushClientModule.getHavenWebPushClientStatus();
      setWebPushStatus(statusBeforeSync);
      if (!statusBeforeSync.vapidPublicKeyConfigured) {
        throw new Error('Web push VAPID public key is not configured for this web build.');
      }
      if (statusBeforeSync.notificationPermission !== 'granted') {
        throw new Error('Browser notification permission must be granted before syncing web push.');
      }

      const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
      await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);
      await modules.webPushClientModule.syncHavenWebPushSubscriptionNow();
      toast.success('Web push subscription sync completed.', { id: 'web-push-sync-success' });
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to sync web push subscription.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushActionBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus]);

  const disableWebPushOnThisDevice = React.useCallback(async () => {
    if (desktopClient.isAvailable()) return;

    setWebPushActionBusy(true);
    setWebPushStatusError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      modules.webPushClientModule.disableHavenWebPushSync();
      const removed = await modules.webPushClientModule.removeHavenWebPushSubscription();
      toast.success(
        removed
          ? 'Web push disabled for this device.'
          : 'Web push sync disabled for this device.',
        { id: 'web-push-disabled' }
      );
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to disable web push on this device.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushActionBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus]);

  const showServiceWorkerTestNotification = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
      const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
      await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);

      const reply = await modules.webPushClientModule.showHavenServiceWorkerTestNotification({
        title: 'Haven Push Test',
        body: 'Local service worker notification test from Push Test Tools.',
        targetUrl: '/?kind=friend_request_accepted',
        kind: 'friend_request_accepted',
        payload: {
          kind: 'friend_request_accepted',
          source: 'web_push_test_tools',
        },
      });

      setWebPushTestResult('Show SW Test Notification', reply ?? { ok: true });
      toast.success('Service worker test notification requested.', { id: 'web-push-test-sw-show' });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to show service worker test notification.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const simulateServiceWorkerNotificationClick = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
      const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
      await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);

      const reply = await modules.webPushClientModule.simulateHavenServiceWorkerNotificationClick({
        targetUrl: '/?kind=friend_request_accepted',
        payload: {
          kind: 'friend_request_accepted',
          source: 'web_push_test_tools',
        },
      });

      setWebPushTestResult('Simulate SW Click', reply ?? { ok: true });
      toast.success('Simulated service worker notification click sent.', {
        id: 'web-push-test-sw-click',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to simulate service worker click.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerOnceForTesting = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({ maxJobs: 10 });
      setWebPushTestResult('Run Worker Once', stats);
      toast.success('web-push-worker manual run completed.', { id: 'web-push-worker-manual-run' });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker manually.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerShadowOnceForTesting = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({
        maxJobs: 10,
        mode: 'shadow',
      });
      setWebPushTestResult('Run Worker Shadow', stats);
      toast.success('web-push-worker shadow dry run completed.', {
        id: 'web-push-worker-shadow-run',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker shadow dry run.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerWakeupOnceForTesting = React.useCallback(async () => {
    if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const modules = await loadWebPushModules();
      if (!modules) return;

      const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({
        maxJobs: 10,
        mode: 'wakeup',
      });
      setWebPushTestResult('Run Worker Wakeup', stats);
      toast.success('web-push-worker wakeup-mode run completed.', {
        id: 'web-push-worker-wakeup-run',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker in wakeup mode.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const updateWebPushWakeupConfigForTesting = React.useCallback(
    async (input: { enabled?: boolean | null; shadowMode?: boolean | null; minIntervalSeconds?: number | null }) => {
      if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;

      setWebPushTestBusy(true);
      setWebPushTestError(null);
      try {
        const updated = await notificationBackend.updateWebPushDispatchWakeupConfig(input);
        setWebPushWakeupDiagnostics(updated);
        setWebPushTestResult('Update Wakeup Scheduler Config', {
          enabled: updated.enabled,
          shadowMode: updated.shadowMode,
          minIntervalSeconds: updated.minIntervalSeconds,
          lastMode: updated.lastMode,
          lastReason: updated.lastReason,
          lastSkipReason: updated.lastSkipReason,
        });
        toast.success('Web push wakeup scheduler config updated.', {
          id: 'web-push-wakeup-config-updated',
        });
      } catch (error) {
        setWebPushTestError(getErrorMessage(error, 'Failed to update wakeup scheduler config.'));
      } finally {
        await refreshWebPushDiagnostics();
        setWebPushTestBusy(false);
      }
    },
    [notificationBackend, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const clearBrowserDeepLinkUrl = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const parsed = new URL(window.location.href);
      if (normalizeDeepLinkPathname(parsed.pathname) === '/') {
        const params = getMergedUrlParams(parsed);
        const hasDeepLinkParams =
          params.has('target') ||
          params.has('open') ||
          params.has('kind') ||
          params.has('notificationKind') ||
          params.has('conversationId') ||
          params.has('friendRequestId') ||
          params.has('communityId') ||
          params.has('channelId') ||
          params.has('invite') ||
          params.has('code');
        if (!hasDeepLinkParams) return;
      }

      window.history.replaceState({}, document.title, '/');
    } catch (historyError) {
      console.warn('Failed to clear web deep-link URL:', historyError);
    }
  }, []);

  const openWebDeepLinkTarget = React.useCallback(
    async (
      target: WebAppDeepLinkTarget,
      options?: {
        clearBrowserUrlAfterOpen?: boolean;
        dedupeKey?: string | null;
      }
    ): Promise<boolean> => {
      const now = Date.now();
      for (const [key, timestamp] of processedWebDeepLinkKeysRef.current.entries()) {
        if (now - timestamp > WEB_DEEP_LINK_DEDUPE_WINDOW_MS) {
          processedWebDeepLinkKeysRef.current.delete(key);
        }
      }

      const dedupeKey = options?.dedupeKey ?? null;
      if (dedupeKey) {
        const lastProcessedAt = processedWebDeepLinkKeysRef.current.get(dedupeKey);
        if (typeof lastProcessedAt === 'number' && now - lastProcessedAt <= WEB_DEEP_LINK_DEDUPE_WINDOW_MS) {
          return false;
        }
      }

      if (!user) {
        pendingWebDeepLinkRef.current = {
          target,
          clearBrowserUrlAfterOpen: Boolean(options?.clearBrowserUrlAfterOpen),
          dedupeKey,
        };
        return false;
      }

      try {
        switch (target.kind) {
          case 'invite': {
            const result = await joinServerByInvite(target.inviteCode);
            toast.success(
              result.joined
                ? `Joined ${result.communityName}`
                : `Opened ${result.communityName}`,
              { id: 'web-deep-link-invite' }
            );
            break;
          }
          case 'dm_message': {
            setWorkspaceMode('dm');
            await openDirectMessageConversation(target.conversationId);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'friend_request_received': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            setFriendsPanelRequestedTab('requests');
            setFriendsPanelHighlightedRequestId(target.friendRequestId);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'friend_request_accepted': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            setFriendsPanelRequestedTab('friends');
            setFriendsPanelHighlightedRequestId(null);
            setFriendsPanelOpen(true);
            setNotificationsPanelOpen(false);
            break;
          }
          case 'channel_mention': {
            setWorkspaceMode('community');
            setCurrentServerId(target.communityId);
            setCurrentChannelId(target.channelId);
            setNotificationsPanelOpen(false);
            break;
          }
          default:
            return false;
        }

        if (dedupeKey) {
          processedWebDeepLinkKeysRef.current.set(dedupeKey, now);
        }
        if (options?.clearBrowserUrlAfterOpen) {
          clearBrowserDeepLinkUrl();
        }
        return true;
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to open link.'), {
          id: 'web-deep-link-open-error',
        });
        return false;
      }
    },
    [
      clearBrowserDeepLinkUrl,
      friendsSocialPanelEnabled,
      openDirectMessageConversation,
      setCurrentChannelId,
      setCurrentServerId,
      user,
    ]
  );

  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (!notificationsPanelOpen) return;
    if (desktopClient.isAvailable()) return;
    void refreshWebPushStatus();
    if (webPushTestToolsEnabled) {
      void refreshWebPushDiagnostics();
    }
  }, [notificationsPanelOpen, refreshWebPushDiagnostics, refreshWebPushStatus, webPushTestToolsEnabled]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = asRecord(event.data);
      if (!data) return;

      if (data.type === 'HAVEN_PUSH_DELIVERY_TRACE') {
        recordLocalNotificationDeliveryTrace({
          notificationRecipientId: getRecordString(asRecord(data.payload), 'recipientId'),
          eventId: getRecordString(asRecord(data.payload), 'eventId'),
          transport: 'web_push',
          stage: 'client_route',
          decision:
            data.decision === 'send' || data.decision === 'skip' || data.decision === 'defer'
              ? data.decision
              : 'defer',
          reasonCode:
            typeof data.reasonCode === 'string' ? (data.reasonCode as never) : 'sent',
          details: {
            source: 'service_worker',
            ...((asRecord(data.details) ?? {}) as Record<string, unknown>),
          },
        });
        return;
      }

      if (data.type !== 'HAVEN_PUSH_NOTIFICATION_CLICK') return;

      const targetUrl = getRecordString(data, 'targetUrl');
      const target = (targetUrl ? parseWebAppDeepLinkUrl(targetUrl) : null) ?? parseWebPushClickPayloadTarget(data.payload);
      if (!target) return;
      const dedupeKey = `sw:${targetUrl ?? ''}:${safeStableStringify(data.payload)}`;

      void openWebDeepLinkTarget(target, {
        clearBrowserUrlAfterOpen: Boolean(targetUrl),
        dedupeKey,
      });
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [openWebDeepLinkTarget]);

  useEffect(() => {
    if (desktopClient.isAvailable()) return;
    if (typeof window === 'undefined') return;

    const currentUrl = window.location.href;
    const target = parseWebAppDeepLinkUrl(currentUrl);
    if (!target) return;

    void openWebDeepLinkTarget(target, {
      clearBrowserUrlAfterOpen: true,
      dedupeKey: `url:${currentUrl}`,
    });
  }, [openWebDeepLinkTarget]);

  useEffect(() => {
    if (!user) return;
    const pending = pendingWebDeepLinkRef.current;
    if (!pending) return;

    pendingWebDeepLinkRef.current = null;
    void openWebDeepLinkTarget(pending.target, {
      clearBrowserUrlAfterOpen: pending.clearBrowserUrlAfterOpen,
      dedupeKey: pending.dedupeKey,
    });
  }, [openWebDeepLinkTarget, user]);

  useEffect(() => {
    if (friendsSocialPanelEnabled) return;
    resetSocialWorkspace();
    setWorkspaceMode('community');
    resetDirectMessages();
  }, [friendsSocialPanelEnabled, resetDirectMessages, resetSocialWorkspace]);

  useEffect(() => {
    if (dmReportReviewPanelEnabled) return;
    setDmReportReviewPanelOpen(false);
  }, [dmReportReviewPanelEnabled]);

  useEffect(() => {
    if (user) return;

    resetPlatformSession();
    resetVoiceState();
    setDmReportReviewPanelOpen(false);
    setNotificationsPanelOpen(false);
    setShowVoiceSettingsModal(false);
    setUserVoiceHardwareTestOpen(false);
    setFriendsPanelOpen(false);
    setWorkspaceMode('community');
    resetMessageState();
    setAuthorProfiles({});
    authorProfileCacheRef.current = {};
    resetFeatureFlags();
    resetNotifications();
    setWebPushStatus(null);
    setWebPushStatusError(null);
    setWebPushStatusLoading(false);
    setWebPushActionBusy(false);
    setWebPushTestBusy(false);
    setWebPushTestError(null);
    setWebPushTestLastResult(null);
    resetSocialWorkspace();
    resetDirectMessages();
    resetChannelsWorkspace();
    resetServerPermissions();
    resetServerSettingsState();
    setShowCreateChannelModal(false);
    setShowJoinServerModal(false);
    setShowServerSettingsModal(false);
    setShowChannelSettingsModal(false);
    setChannelSettingsTargetId(null);
    setShowAccountModal(false);
    resetServerInvites();
    resetServerRoleManagement();
    resetChannelPermissionsState();
    resetChannelGroups();
    resetMembersModal();
    setRenameServerDraft(null);
    setRenameChannelDraft(null);
    setRenameGroupDraft(null);
    setCreateGroupDraft(null);
    resetCommunityBans();
  }, [
    resetChannelGroups,
    resetChannelsWorkspace,
    resetChannelPermissionsState,
    resetFeatureFlags,
    resetCommunityBans,
    resetMessageState,
    resetMembersModal,
    resetNotifications,
    resetPlatformSession,
    resetDirectMessages,
    resetSocialWorkspace,
    resetVoiceState,
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
    resetServerPermissions,
    user,
  ]);

  // Reset server-scoped UI when no server is selected
  useEffect(() => {
    if (!currentServerId) {
      resetChannelsWorkspace();
      resetVoiceState();
      setMessages([]);
      setMessageReactions([]);
      setMessageAttachments([]);
      setMessageLinkPreviews([]);
      setAuthorProfiles({});
      setShowCreateChannelModal(false);
      setShowJoinServerModal(false);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
      resetServerSettingsState();
      resetServerInvites();
      resetServerRoleManagement();
      resetChannelPermissionsState();
      resetChannelGroups();
      resetMembersModal();
      setRenameChannelDraft(null);
      setRenameGroupDraft(null);
      setCreateGroupDraft(null);
      resetCommunityBans();
    }
  }, [
    currentServerId,
    resetChannelGroups,
    resetChannelPermissionsState,
    resetChannelsWorkspace,
    resetCommunityBans,
    resetMembersModal,
    resetVoiceState,
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
  ]);

  // Determine whether Haven Developer messaging is allowed in the current channel.
  useEffect(() => {
    let isMounted = true;

    if (!user || !currentServerId || !currentChannelId || !canPostHavenDevMessage) {
      setCanSendHavenDeveloperMessage(false);
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      setCanSendHavenDeveloperMessage(false);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const resolveHavenDeveloperMessagingAccess = async () => {
      try {
        const allowed = await communityBackend.isHavenDeveloperMessagingAllowed({
          communityId: currentServerId,
          channelId: currentChannelId,
        });
        if (!isMounted) return;
        setCanSendHavenDeveloperMessage(allowed);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error resolving Haven developer messaging access:', error);
        setCanSendHavenDeveloperMessage(false);
      }
    };

    void resolveHavenDeveloperMessagingAccess();

    return () => {
      isMounted = false;
    };
  }, [user, currentServerId, currentChannelId, canPostHavenDevMessage, channels]);

  const normalizeInviteCode = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const maybeFromPath = trimmed.split('?')[0].replace(/\/+$/, '');
    if (maybeFromPath.includes('/')) {
      const pathSegments = maybeFromPath.split('/').filter(Boolean);
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (lastSegment) return lastSegment.toUpperCase();
    }

    return maybeFromPath.toUpperCase();
  };

  async function joinServerByInvite(inviteInput: string): Promise<{
    communityName: string;
    joined: boolean;
  }> {
    const code = normalizeInviteCode(inviteInput);
    if (!code) {
      throw new Error('Invite code is required.');
    }

    const redeemedInvite = await controlPlaneBackend.redeemCommunityInvite(code);

    await refreshServers();
    setCurrentServerId(redeemedInvite.communityId);

    return {
      communityName: redeemedInvite.communityName,
      joined: redeemedInvite.joined,
    };
  }

  async function saveAttachment(attachment: MessageAttachment) {
    if (!attachment.signedUrl) {
      throw new Error('Media link is not available.');
    }

    if (!desktopClient.isAvailable()) {
      window.open(attachment.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const suggestedName = attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'media';
    await desktopClient.saveFileFromUrl({
      url: attachment.signedUrl,
      suggestedName,
    });
  }

  async function reportUserProfile(input: {
    targetUserId: string;
    reason: string;
    communityId?: string;
  }) {
    if (!user) throw new Error('Not authenticated.');
    const targetCommunityId = input.communityId ?? currentServerId;
    if (!targetCommunityId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(targetCommunityId);
    await communityBackend.reportUserProfile({
      communityId: targetCommunityId,
      targetUserId: input.targetUserId,
      reporterUserId: user.id,
      reason: input.reason,
    });
  }

  async function banUserFromServer(input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) {
    const communityBackend = getCommunityDataBackend(input.communityId);
    await communityBackend.banCommunityMember({
      communityId: input.communityId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    });

    try {
      await refreshMembersModalMembersIfOpen(input.communityId);
    } catch (error) {
      console.error('Failed to refresh members after ban:', error);
    }

    if (showServerSettingsModal && currentServerId === input.communityId) {
      try {
        await loadCommunityBans(input.communityId);
      } catch (error) {
        console.error('Failed to refresh bans after ban:', error);
      }
    }
  }

  async function resolveBanEligibleServers(targetUserId: string): Promise<BanEligibleServer[]> {
    if (!targetUserId) return [];
    return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
  }

  async function sendHavenDeveloperMessage(
    content: string,
    options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
  ) {
    if (!currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.postHavenDeveloperMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      content,
      replyToMessageId: options?.replyToMessageId,
      mediaUpload: options?.mediaFile
        ? {
            file: options.mediaFile,
            expiresInHours: options.mediaExpiresInHours,
          }
        : undefined,
    });
  }

  async function saveAccountSettings(values: { username: string; avatarUrl: string | null }) {
    if (!user) throw new Error('Not authenticated');

    await controlPlaneBackend.updateUserProfile({
      userId: user.id,
      username: values.username,
      avatarUrl: values.avatarUrl,
    });

    applyLocalProfileUpdate(values);
  }

  const handleLeaveServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    setPendingUiConfirmation({
      kind: 'leave-server',
      communityId,
      serverName: server?.name ?? 'this server',
    });
  };

  const handleDeleteServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    setPendingUiConfirmation({
      kind: 'delete-server',
      communityId,
      serverName: server?.name ?? 'this server',
    });
  };

  const handleRenameServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    if (!server) return;
    setRenameServerDraft({
      serverId: communityId,
      currentName: server.name,
    });
  };

  const handleRenameChannel = (channelId: string) => {
    const channel = channels.find((candidate) => candidate.id === channelId);
    if (!channel) return;
    setRenameChannelDraft({
      channelId,
      currentName: channel.name,
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    const channel = channels.find((candidate) => candidate.id === channelId);
    if (!channel) return;
    setPendingUiConfirmation({
      kind: 'delete-channel',
      channelId,
      channelName: channel.name,
    });
  };

  const handleCreateChannelGroup = (channelId?: string) => {
    setCreateGroupDraft({
      channelId: channelId ?? null,
    });
  };

  const handleRenameChannelGroup = (groupId: string) => {
    const group = channelGroupState.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    setRenameGroupDraft({
      groupId,
      currentName: group.name,
    });
  };

  const handleDeleteChannelGroup = (groupId: string) => {
    const group = channelGroupState.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    setPendingUiConfirmation({
      kind: 'delete-channel-group',
      groupId,
      groupName: group.name,
    });
  };

  const confirmPendingUiAction = () => {
    if (!pendingUiConfirmation) return;

    const action = pendingUiConfirmation;
    setPendingUiConfirmation(null);

    switch (action.kind) {
      case 'leave-server':
        void leaveServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to leave server.'), { id: 'leave-server-error' });
        });
        return;
      case 'delete-server':
        void deleteServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete server.'), { id: 'delete-server-error' });
        });
        return;
      case 'delete-channel':
        void deleteChannel(action.channelId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete channel.'), { id: 'delete-channel-error' });
        });
        return;
      case 'delete-channel-group':
        void deleteChannelGroup(action.groupId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete channel group.'), {
            id: 'delete-channel-group-error',
          });
        });
        return;
      default:
        return;
    }
  };

  if (authStatus === 'initializing') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        Loading...
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        <p>{authError ?? 'Authentication failed. Please restart the app.'}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const isServersLoading = serversStatus === 'loading';
  const baseUserDisplayName = profileUsername || user.email?.split('@')[0] || 'User';
  const userDisplayName = isPlatformStaff
    ? `${platformStaffPrefix ?? 'Haven'}-${baseUserDisplayName}`
    : baseUserDisplayName;
  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites ||
    serverPermissions.canManageDeveloperAccess;
  const canManageCurrentServer = serverPermissions.isOwner || serverPermissions.canManageServer;
  const sidebarChannelGroups = channelGroupState.groups.map((group) => ({
    id: group.id,
    name: group.name,
    channelIds: group.channelIds,
    isCollapsed: channelGroupState.collapsedGroupIds.includes(group.id),
  }));
  const showDmWorkspace = dmWorkspaceIsActive;
  const selectedDmConversation =
    selectedDmConversationId
      ? dmConversations.find((conversation) => conversation.conversationId === selectedDmConversationId) ??
        null
      : null;
  const {
    title: pendingUiConfirmationTitle,
    description: pendingUiConfirmationDescription,
    confirmLabel: pendingUiConfirmationConfirmLabel,
    isDestructive: pendingUiConfirmationIsDestructive,
  } = getPendingUiConfirmationCopy(pendingUiConfirmation);

  return (
    <>
      <PasswordRecoveryDialog
        open={passwordRecoveryRequired}
        onCompletePasswordRecovery={completePasswordRecovery}
        onSignOut={signOut}
      />

      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          servers={servers}
          currentServerId={currentServerId}
          currentServerIsOwner={serverPermissions.isOwner}
          canManageCurrentServer={canManageCurrentServer}
          canOpenCurrentServerSettings={canOpenServerSettings}
          onServerClick={(serverId) => {
            setWorkspaceMode('community');
            setCurrentServerId(serverId);
          }}
          onCreateServer={() => setShowCreateModal(true)}
          onJoinServer={() => setShowJoinServerModal(true)}
          onOpenNotifications={() => setNotificationsPanelOpen(true)}
          notificationUnseenCount={notificationCounts.unseenCount}
          notificationHasUnseenPulse={notificationCounts.unseenCount > 0}
          onOpenDirectMessages={dmWorkspaceEnabled ? openDirectMessagesWorkspace : undefined}
          directMessagesActive={dmWorkspaceIsActive}
          onOpenFriends={
            friendsSocialPanelEnabled
              ? () => {
                  setFriendsPanelRequestedTab(null);
                  setFriendsPanelHighlightedRequestId(null);
                  setFriendsPanelOpen(true);
                }
              : undefined
          }
          friendRequestIncomingCount={socialCounts.incomingPendingRequestCount}
          friendRequestHasPendingPulse={socialCounts.incomingPendingRequestCount > 0}
          onOpenDmReportReview={
            dmReportReviewPanelEnabled ? () => setDmReportReviewPanelOpen(true) : undefined
          }
          userDisplayName={userDisplayName}
          userAvatarUrl={profileAvatarUrl}
          onOpenAccountSettings={() => setShowAccountModal(true)}
          onViewServerMembers={(serverId) => {
            void openServerMembersModal(serverId);
          }}
          onLeaveServer={handleLeaveServer}
          onDeleteServer={handleDeleteServer}
          onRenameServer={handleRenameServer}
          onOpenServerSettingsForServer={(serverId) => {
            void openServerSettingsModal(serverId);
          }}
        />

        {showDmWorkspace ? (
          <>
            <DirectMessagesSidebar
              currentUserDisplayName={userDisplayName}
              conversations={dmConversations}
              selectedConversationId={selectedDmConversationId}
              loading={dmConversationsLoading}
              refreshing={dmConversationsRefreshing}
              error={dmConversationsError}
              onSelectConversation={(conversationId) => {
                setSelectedDmConversationId(conversationId);
              }}
              onRefresh={() => {
                void refreshDmConversations({ suppressLoadingState: true });
              }}
            />
            <DirectMessageArea
              currentUserId={user.id}
              currentUserDisplayName={userDisplayName}
              conversation={selectedDmConversation}
              messages={dmMessages}
              loading={dmMessagesLoading}
              sending={dmMessageSendPending}
              refreshing={dmMessagesRefreshing}
              error={dmMessagesError}
              onRefresh={() => {
                if (!selectedDmConversationId) return;
                void refreshDmMessages(selectedDmConversationId, {
                  suppressLoadingState: true,
                  markRead: true,
                });
              }}
              onSendMessage={sendDirectMessage}
              onToggleMute={toggleSelectedDmConversationMuted}
              onBlockUser={blockDirectMessageUser}
              onReportMessage={reportDirectMessage}
            />
          </>
        ) : isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">Loading servers...</p>
          </div>
        ) : currentServer ? (
          <>
            <Sidebar
              serverName={currentServer.name}
              userName={userDisplayName}
              composerHeight={composerHeight}
              channels={channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                kind: channel.kind,
              }))}
              channelGroups={sidebarChannelGroups}
              ungroupedChannelIds={channelGroupState.ungroupedChannelIds}
              currentChannelId={currentChannelId}
              onChannelClick={setCurrentChannelId}
              onVoiceChannelClick={requestVoiceChannelJoin}
              activeVoiceChannelId={activeVoiceChannelId}
              voiceChannelParticipants={voiceChannelParticipants}
              voiceStatusPanel={
                activeVoiceChannel ? (
                  <div className="px-2 pt-2 pb-1 border-b border-[#22334f]">
                    <div className="rounded-md border border-[#304867] bg-[#142033] px-2 py-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">Voice Connected</p>
                          <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                            <Headphones className="size-3.5" />
                            {activeVoiceChannel.name}
                          </p>
                          <p className="text-[11px] text-[#95a5bf] truncate">{currentServer.name}</p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            voiceConnected
                              ? 'bg-[#2f9f73]/20 text-[#6dd5a6]'
                              : 'bg-[#44546f]/40 text-[#b5c4de]'
                          }`}
                        >
                          {voiceConnected ? 'Live' : 'Connecting'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {!voiceSessionState.joined ? (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => voiceControlActions?.join()}
                            disabled={voiceSessionState.joining || !voiceControlActions}
                            className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                          >
                            <Headphones className="size-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => voiceControlActions?.toggleMute()}
                              disabled={voiceSessionState.listenOnly || !voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                voiceSessionState.isMuted
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              {voiceSessionState.isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => voiceControlActions?.toggleDeafen()}
                              disabled={!voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                voiceSessionState.isDeafened
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              <VolumeX className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setVoicePanelOpen((prev) => !prev)}
                          className={`hover:text-white hover:bg-[#22334f] ${
                            voicePanelOpen ? 'text-white' : 'text-[#a9b8cf]'
                          }`}
                        >
                          <Settings2 className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => disconnectVoiceSession()}
                          className="text-[#f0b0b0] hover:text-[#ffd1d1] hover:bg-[#3b2535]"
                        >
                          <PhoneOff className="size-4" />
                        </Button>
                        <div className="ml-auto text-[11px] text-[#95a5bf]">
                          {activeVoiceParticipantCount} in call
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null
              }
              footerStatusActions={
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setShowVoiceSettingsModal(true)}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                  aria-label="Open voice settings"
                  title="Voice Settings"
                >
                  <Headphones className="size-3.5" />
                  <span>Voice</span>
                </Button>
              }
              onCreateChannel={
                serverPermissions.canCreateChannels ? () => setShowCreateChannelModal(true) : undefined
              }
              canManageChannels={serverPermissions.canManageChannels}
              onRenameChannel={
                serverPermissions.canManageChannels
                  ? handleRenameChannel
                  : undefined
              }
              onDeleteChannel={
                serverPermissions.canManageChannels
                  ? handleDeleteChannel
                  : undefined
              }
              onOpenChannelSettings={
                serverPermissions.canManageChannels
                  ? (channelId) => {
                      void openChannelSettingsModal(channelId);
                    }
                  : undefined
              }
              onAddChannelToGroup={
                serverPermissions.canManageChannels
                  ? (channelId, groupId) => {
                      void assignChannelToGroup(channelId, groupId).catch((error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to assign channel to group.'), {
                          id: 'assign-channel-group-error',
                        });
                      });
                    }
                  : undefined
              }
              onRemoveChannelFromGroup={
                serverPermissions.canManageChannels
                  ? (channelId) => {
                      void removeChannelFromGroup(channelId).catch((error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to remove channel from group.'), {
                          id: 'remove-channel-group-error',
                        });
                      });
                    }
                  : undefined
              }
              onCreateChannelGroup={
                serverPermissions.canManageChannels ? handleCreateChannelGroup : undefined
              }
              onToggleChannelGroup={
                (groupId, isCollapsed) => {
                  void setChannelGroupCollapsed(groupId, isCollapsed).catch((error: unknown) => {
                    console.error('Failed to persist channel group collapse state:', error);
                  });
                }
              }
              onRenameChannelGroup={
                serverPermissions.canManageChannels ? handleRenameChannelGroup : undefined
              }
              onDeleteChannelGroup={
                serverPermissions.canManageChannels ? handleDeleteChannelGroup : undefined
              }
              onOpenServerSettings={
                canOpenServerSettings ? () => void openServerSettingsModal() : undefined
              }
            />
            {channelsLoading && !currentRenderableChannel ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">Loading channels...</p>
              </div>
            ) : currentRenderableChannel ? (
              <ChatArea
                communityId={currentServer.id}
                channelId={currentRenderableChannel.id}
                channelName={currentRenderableChannel.name}
                channelKind={currentRenderableChannel.kind}
                currentUserDisplayName={userDisplayName}
                messages={messages}
                messageReactions={messageReactions}
                messageAttachments={messageAttachments}
                messageLinkPreviews={messageLinkPreviews}
                authorProfiles={authorProfiles}
                currentUserId={user.id}
                canSpeakInVoiceChannel={canSpeakInVoiceChannel}
                canManageMessages={serverPermissions.canManageMessages}
                canCreateReports={serverPermissions.canCreateReports}
                canManageBans={serverPermissions.canManageBans}
                canRefreshLinkPreviews={serverPermissions.canRefreshLinkPreviews}
                showVoiceDiagnostics={isPlatformStaff}
                onOpenChannelSettings={
                  serverPermissions.canManageChannels
                    ? () => void openChannelSettingsModal(currentRenderableChannel.id)
                    : undefined
                }
                onOpenVoiceControls={() => setVoicePanelOpen(true)}
                onSendMessage={sendMessage}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onToggleMessageReaction={toggleMessageReaction}
                onReportMessage={reportMessage}
                onRequestMessageLinkPreviewRefresh={requestMessageLinkPreviewRefresh}
                hasOlderMessages={hasOlderMessages}
                isLoadingOlderMessages={isLoadingOlderMessages}
                onRequestOlderMessages={requestOlderMessages}
                onSaveAttachment={saveAttachment}
                onReportUserProfile={({ targetUserId, reason }) =>
                  reportUserProfile({
                    targetUserId,
                    reason,
                    communityId: currentServer.id,
                  })
                }
                onBanUserFromServer={banUserFromServer}
                onResolveBanEligibleServers={resolveBanEligibleServers}
                onDirectMessageUser={directMessageUser}
                onComposerHeightChange={setComposerHeight}
                onSendHavenDeveloperMessage={
                  canSendHavenDeveloperMessage ? sendHavenDeveloperMessage : undefined
                }
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">
                  {channelsError ?? 'No channels yet. Create one to get started!'}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">
              {serversError ?? 'No servers yet. Create one to get started!'}
            </p>
          </div>
        )}
      </div>

      {currentServer && activeVoiceChannel && (
        <div
          className={`fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${
            voicePanelOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!voicePanelOpen}
        >
          <div
            className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
              voicePanelOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => setVoicePanelOpen(false)}
          />
          <div
            className={`relative z-10 w-full max-w-4xl max-h-[88vh] rounded-lg border border-[#304867] bg-[#111a2b] shadow-2xl overflow-hidden transition-all duration-200 ${
              voicePanelOpen ? 'translate-y-0 scale-100' : 'translate-y-3 scale-[0.98]'
            }`}
          >
            <div className="scrollbar-inset max-h-[88vh] overflow-y-auto">
              <VoiceChannelPane
                communityId={currentServer.id}
                channelId={activeVoiceChannel.id}
                channelName={activeVoiceChannel.name}
                currentUserId={user.id}
                currentUserDisplayName={userDisplayName}
                canSpeak={canSpeakInVoiceChannel}
                voiceSettings={appSettings.voice}
                voiceSettingsSaving={voiceSettingsSaving}
                voiceSettingsError={voiceSettingsError}
                onUpdateVoiceSettings={(next) => {
                  void setVoiceSettings(next);
                }}
                onOpenVoiceSettings={() => setShowVoiceSettingsModal(true)}
                onOpenVoiceHardwareTest={() => setUserVoiceHardwareTestOpen(true)}
                showDiagnostics={isPlatformStaff}
                autoJoin
                onParticipantsChange={setVoiceParticipants}
                onConnectionChange={setVoiceConnected}
                onSessionStateChange={setVoiceSessionState}
                onControlActionsReady={setVoiceControlActions}
                onLeave={() => disconnectVoiceSession({ triggerPaneLeave: false })}
              />
            </div>
          </div>
        </div>
      )}

      <NotificationCenterModal
        open={notificationsPanelOpen}
        onOpenChange={setNotificationsPanelOpen}
        notifications={notificationItems}
        counts={notificationCounts}
        loading={notificationsLoading}
        error={notificationsError}
        refreshing={notificationsRefreshing}
        onRefresh={() => {
          void refreshNotificationsManually();
        }}
        onMarkAllSeen={() => {
          void markAllNotificationsSeen();
        }}
        onMarkNotificationRead={(recipientId) => {
          void markNotificationRead(recipientId);
        }}
        onDismissNotification={(recipientId) => {
          void dismissNotification(recipientId);
        }}
        onOpenNotificationItem={(notification) => {
          void openNotificationItem(notification);
        }}
        onAcceptFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void acceptFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        onDeclineFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void declineFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        preferences={notificationPreferences}
        preferencesLoading={notificationPreferencesLoading}
        preferencesSaving={notificationPreferencesSaving}
        preferencesError={notificationPreferencesError}
        onUpdatePreferences={(next) => {
          void saveNotificationPreferences(next);
        }}
        localAudioSettings={appSettings.notifications}
        localAudioSaving={notificationAudioSettingsSaving}
        localAudioError={notificationAudioSettingsError}
        onUpdateLocalAudioSettings={(next) => {
          void setNotificationAudioSettings(next);
        }}
        webPushControls={
          desktopClient.isAvailable()
            ? undefined
            : {
                status: webPushStatus,
                loading: webPushStatusLoading,
                busy: webPushActionBusy,
                error: webPushStatusError,
                onRefreshStatus: () => {
                  void refreshWebPushStatus();
                },
                onEnableOnThisDevice: () => {
                  void enableWebPushOnThisDevice();
                },
                onSyncNow: () => {
                  void syncWebPushNow();
                },
                onDisableOnThisDevice: () => {
                  void disableWebPushOnThisDevice();
                },
                testTools: webPushTestToolsEnabled
                  ? {
                      busy: webPushTestBusy,
                      error: webPushTestError,
                      lastResult: webPushTestLastResult,
                      onShowServiceWorkerTestNotification: () => {
                        void showServiceWorkerTestNotification();
                      },
                      onSimulateNotificationClick: () => {
                        void simulateServiceWorkerNotificationClick();
                      },
                      onRunWorkerOnce: () => {
                        void runWebPushWorkerOnceForTesting();
                      },
                      onRunWorkerShadowOnce: () => {
                        void runWebPushWorkerShadowOnceForTesting();
                      },
                      onRunWorkerWakeupOnce: () => {
                        void runWebPushWorkerWakeupOnceForTesting();
                      },
                      diagnostics: {
                        ...((): {
                          backendParitySummary: WebPushBackendTraceParitySummary;
                          backendParityDrift: WebPushBackendTraceParityDriftRow[];
                          cutoverReadiness: WebPushCutoverReadiness;
                        } => {
                          const paritySummary = buildBackendTraceParitySummary(webPushBackendTraces);
                          const parityDrift = buildBackendTraceParityDrift(paritySummary);
                          const queueHealthAlerts = buildWebPushQueueHealthAlerts(webPushQueueHealthDiagnostics);
                          return {
                            backendParitySummary: paritySummary,
                            backendParityDrift: parityDrift,
                            cutoverReadiness: buildWebPushCutoverReadiness({
                              wakeupState: webPushWakeupDiagnostics,
                              queueHealthAlerts,
                              backendParitySummary: paritySummary,
                              backendParityDrift: parityDrift,
                            }),
                          };
                        })(),
                        loading: webPushDiagnosticsLoading,
                        error: webPushDiagnosticsError,
                        devMode: webPushRouteDiagnostics?.mode ?? 'real',
                        routeMode: webPushRouteDiagnostics?.decision.routeMode ?? 'unknown',
                        routeReasons: webPushRouteDiagnostics?.decision.reasonCodes ?? [],
                        queueHealthState: webPushQueueHealthDiagnostics,
                        queueHealthAlerts: buildWebPushQueueHealthAlerts(webPushQueueHealthDiagnostics),
                        wakeupState: webPushWakeupDiagnostics,
                        backendWakeSourceCounts: buildBackendWakeSourceCounts(webPushBackendTraces),
                        onSetWakeupConfig: (input) => {
                          void updateWebPushWakeupConfigForTesting(input);
                        },
                        onRefresh: () => {
                          void refreshWebPushDiagnostics();
                        },
                        onSetDevMode: (mode) => {
                          void setWebPushNotificationDevMode(mode);
                        },
                        onSimulateFocused: () => {
                          void setNotificationRouteSimulationFocus(true);
                        },
                        onSimulateBackground: () => {
                          void setNotificationRouteSimulationFocus(false);
                        },
                        onClearSimulation: () => {
                          void clearNotificationRouteSimulation();
                        },
                        onRecordSimulationTrace: () => {
                          void recordNotificationRouteSimulationTrace();
                        },
                        onClearLocalTraces: () => {
                          void clearLocalNotificationTraces();
                        },
                        localTraces: webPushRouteDiagnostics?.localTraces ?? [],
                        backendTraces: webPushBackendTraces,
                      },
                    }
                  : undefined,
              }
        }
      />

      {friendsSocialPanelEnabled && user && (
        <FriendsModal
          open={friendsPanelOpen}
          onOpenChange={(open) => {
            setFriendsPanelOpen(open);
            if (!open) {
              setFriendsPanelHighlightedRequestId(null);
            }
          }}
          currentUserId={user.id}
          currentUserDisplayName={userDisplayName}
          onStartDirectMessage={directMessageUser}
          requestedTab={friendsPanelRequestedTab}
          highlightedRequestId={friendsPanelHighlightedRequestId}
        />
      )}

      {voiceHardwareDebugPanelEnabled && (
        <VoiceHardwareDebugPanel
          open={voiceHardwareDebugPanelOpen}
          onOpenChange={setVoiceHardwareDebugPanelOpen}
          hotkeyLabel={VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL}
        />
      )}

      {dmReportReviewPanelEnabled && user && (
        <DmReportReviewPanel
          open={dmReportReviewPanelOpen}
          onOpenChange={setDmReportReviewPanelOpen}
          currentUserId={user.id}
          currentUserDisplayName={userDisplayName}
        />
      )}

      <AlertDialog open={Boolean(voiceJoinPrompt)} onOpenChange={(open) => !open && cancelVoiceChannelJoinPrompt()}>
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {voiceJoinPrompt?.mode === 'switch' ? 'Switch voice channel?' : 'Join voice channel?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {voiceJoinPrompt?.mode === 'switch'
                ? 'You are already connected to voice. Switching will move your session to the new channel.'
                : 'Join this voice channel now? You can keep browsing text channels while connected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoiceChannelJoin}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {voiceJoinPrompt?.mode === 'switch' ? 'Switch' : 'Join'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingUiConfirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingUiConfirmation(null);
          }
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingUiConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingUiConfirmationDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmPendingUiAction();
              }}
              className={
                pendingUiConfirmationIsDestructive
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-[#3f79d8] hover:bg-[#325fae] text-white'
              }
            >
              {pendingUiConfirmationConfirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createServer}
        />
      )}

      {showCreateChannelModal && currentServerId && serverPermissions.canCreateChannels && (
        <CreateChannelModal
          onClose={() => setShowCreateChannelModal(false)}
          onCreate={createChannel}
        />
      )}

      {showJoinServerModal && (
        <JoinServerModal
          onClose={() => setShowJoinServerModal(false)}
          onJoin={joinServerByInvite}
        />
      )}

      {showServerSettingsModal && currentServerId && canOpenServerSettings && (
        <ServerSettingsModal
          channels={channels.map((channel) => ({ id: channel.id, name: channel.name }))}
          initialValues={serverSettingsInitialValues}
          loadingInitialValues={serverSettingsLoading}
          initialLoadError={serverSettingsLoadError}
          canManageServer={serverPermissions.canManageServer}
          canManageRoles={serverPermissions.canManageRoles}
          canManageMembers={serverPermissions.canManageMembers}
          canManageBans={serverPermissions.canManageBans}
          isOwner={serverPermissions.isOwner}
          roles={serverRoles}
          members={serverMembers}
          permissionsCatalog={serverPermissionCatalog}
          roleManagementLoading={serverRoleManagementLoading}
          roleManagementError={serverRoleManagementError}
          canManageDeveloperAccess={serverPermissions.canManageDeveloperAccess}
          canManageInvites={serverPermissions.canManageInvites}
          invites={serverInvites}
          invitesLoading={serverInvitesLoading}
          invitesError={serverInvitesError}
          bans={communityBans}
          bansLoading={communityBansLoading}
          bansError={communityBansError}
          inviteBaseUrl={getPlatformInviteBaseUrl()}
          onClose={() => setShowServerSettingsModal(false)}
          onSave={saveServerSettings}
          onCreateRole={createServerRole}
          onUpdateRole={updateServerRole}
          onDeleteRole={deleteServerRole}
          onSaveRolePermissions={saveServerRolePermissions}
          onSaveMemberRoles={saveServerMemberRoles}
          onCreateInvite={createServerInvite}
          onRevokeInvite={revokeServerInvite}
          onUnbanUser={unbanUserFromCurrentServer}
        />
      )}

      {showChannelSettingsModal && channelSettingsTarget && serverPermissions.canManageChannels && (
        <ChannelSettingsModal
          initialName={channelSettingsTarget.name}
          initialTopic={channelSettingsTarget.topic}
          canDelete={channels.length > 1}
          rolePermissions={channelRolePermissions}
          memberPermissions={channelMemberPermissions}
          availableMembers={channelPermissionMemberOptions}
          permissionsLoading={channelPermissionsLoading}
          permissionsLoadError={channelPermissionsLoadError}
          onClose={() => {
            setShowChannelSettingsModal(false);
            setChannelSettingsTargetId(null);
          }}
          onSave={saveChannelSettings}
          onDelete={deleteCurrentChannel}
          onSaveRolePermissions={saveRoleChannelPermissions}
          onSaveMemberPermissions={saveMemberChannelPermissions}
        />
      )}

      <ServerMembersModal
        open={showMembersModal}
        currentUserId={user?.id ?? null}
        serverName={membersModalServerName}
        loading={membersModalLoading}
        error={membersModalError}
        members={membersModalMembers}
        canReportProfiles={membersModalCanCreateReports}
        canBanProfiles={membersModalCanManageBans}
        onResolveBanServers={resolveBanEligibleServers}
        onDirectMessage={directMessageUser}
        onReportUser={async (targetUserId, reason) => {
          if (!membersModalCommunityId) return;
          await reportUserProfile({
            targetUserId,
            reason,
            communityId: membersModalCommunityId,
          });
        }}
        onBanUser={async (targetUserId, communityId, reason) => {
          await banUserFromServer({
            targetUserId,
            communityId,
            reason,
          });
        }}
        onClose={closeMembersModal}
      />

      <QuickRenameDialog
        open={Boolean(renameServerDraft)}
        title="Rename Server"
        initialValue={renameServerDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameServerDraft(null)}
        onConfirm={async (value) => {
          if (!renameServerDraft) return;
          await renameServer(renameServerDraft.serverId, value);
          setRenameServerDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(renameChannelDraft)}
        title="Rename Channel"
        initialValue={renameChannelDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameChannelDraft(null)}
        onConfirm={async (value) => {
          if (!renameChannelDraft) return;
          await renameChannel(renameChannelDraft.channelId, value);
          setRenameChannelDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(renameGroupDraft)}
        title="Rename Channel Group"
        initialValue={renameGroupDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameGroupDraft(null)}
        onConfirm={async (value) => {
          if (!renameGroupDraft) return;
          await renameChannelGroup(renameGroupDraft.groupId, value);
          setRenameGroupDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(createGroupDraft)}
        title="Create Channel Group"
        initialValue=""
        confirmLabel="Create"
        onClose={() => setCreateGroupDraft(null)}
        onConfirm={async (value) => {
          await createChannelGroup(value, createGroupDraft?.channelId ?? null);
          setCreateGroupDraft(null);
        }}
      />

      {showAccountModal && (
        <AccountSettingsModal
          userEmail={user.email ?? 'No email'}
          initialUsername={baseUserDisplayName}
          initialAvatarUrl={profileAvatarUrl}
          autoUpdateEnabled={appSettings.autoUpdateEnabled}
          updaterStatus={updaterStatus}
          updaterStatusLoading={updaterStatusLoading || appSettingsLoading}
          checkingForUpdates={checkingForUpdates}
          onClose={() => setShowAccountModal(false)}
          onSave={saveAccountSettings}
          onOpenVoiceSettings={() => setShowVoiceSettingsModal(true)}
          onAutoUpdateChange={setAutoUpdateEnabled}
          onCheckForUpdates={checkForUpdatesNow}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
      )}

      <VoiceSettingsModal
        open={showVoiceSettingsModal}
        onOpenChange={setShowVoiceSettingsModal}
        settings={appSettings.voice}
        saving={voiceSettingsSaving}
        error={voiceSettingsError}
        onUpdateSettings={(next) => {
          void setVoiceSettings(next);
        }}
        onOpenVoiceHardwareTest={() => setUserVoiceHardwareTestOpen(true)}
      />

      <VoiceHardwareDebugPanel
        open={userVoiceHardwareTestOpen}
        onOpenChange={setUserVoiceHardwareTestOpen}
        hotkeyLabel={null}
        title="Voice Hardware Test"
        description="Test microphone capture and speaker playback locally before joining a voice channel."
        showDebugWorkflow={false}
      />
    </>
  );
}


