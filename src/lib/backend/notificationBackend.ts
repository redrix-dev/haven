import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  NotificationCounts,
  NotificationDeliveryTraceRecord,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupConfigUpdate,
  WebPushDispatchWakeupDiagnostics,
  WebPushSubscriptionRecord,
  WebPushSubscriptionUpsertInput,
} from './types';

export interface NotificationBackend {
  listNotifications(input?: {
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeRecipientId?: string | null;
  }): Promise<NotificationItem[]>;
  listSoundNotifications(input?: {
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeRecipientId?: string | null;
  }): Promise<NotificationItem[]>;
  listWebPushSubscriptions(): Promise<WebPushSubscriptionRecord[]>;
  upsertWebPushSubscription(input: WebPushSubscriptionUpsertInput): Promise<WebPushSubscriptionRecord>;
  deleteWebPushSubscription(endpoint: string): Promise<boolean>;
  listNotificationDeliveryTraces(input?: {
    limit?: number;
    recipientId?: string | null;
  }): Promise<NotificationDeliveryTraceRecord[]>;
  getWebPushDispatchQueueHealthDiagnostics(): Promise<WebPushDispatchQueueHealthDiagnostics | null>;
  getWebPushDispatchWakeupDiagnostics(): Promise<WebPushDispatchWakeupDiagnostics | null>;
  updateWebPushDispatchWakeupConfig(
    input: WebPushDispatchWakeupConfigUpdate
  ): Promise<WebPushDispatchWakeupDiagnostics>;
  getNotificationCounts(): Promise<NotificationCounts>;
  markNotificationsSeen(recipientIds: string[]): Promise<number>;
  markNotificationsRead(recipientIds: string[]): Promise<number>;
  markAllNotificationsSeen(): Promise<number>;
  dismissNotifications(recipientIds: string[]): Promise<number>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(input: NotificationPreferenceUpdate): Promise<NotificationPreferences>;
  subscribeToNotificationInbox(
    userId: string,
    onChange: (payload?: unknown) => void
  ): RealtimeChannel;
}

type NotificationListRow = {
  recipient_id: string;
  event_id: string;
  kind: NotificationItem['kind'];
  source_kind: NotificationItem['sourceKind'];
  source_id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  payload: unknown;
  deliver_in_app: boolean;
  deliver_sound: boolean;
  created_at: string;
  seen_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
};

type NotificationCountsRow = {
  unseen_count: number | null;
  unread_count: number | null;
};

type NotificationPreferencesRow = {
  user_id: string;
  friend_request_in_app_enabled: boolean;
  friend_request_sound_enabled: boolean;
  friend_request_push_enabled: boolean;
  dm_in_app_enabled: boolean;
  dm_sound_enabled: boolean;
  dm_push_enabled: boolean;
  mention_in_app_enabled: boolean;
  mention_sound_enabled: boolean;
  mention_push_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type WebPushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  installation_id: string | null;
  p256dh_key: string;
  auth_key: string;
  expiration_time: string | null;
  user_agent: string | null;
  client_platform: string | null;
  app_display_mode: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

type NotificationDeliveryTraceRow = {
  id: string;
  notification_recipient_id: string | null;
  notification_event_id: string | null;
  recipient_user_id: string | null;
  transport: string;
  stage: string;
  decision: string;
  reason_code: string;
  details: unknown;
  created_at: string;
};

type WebPushDispatchWakeupDiagnosticsRow = {
  enabled: boolean;
  shadow_mode: boolean;
  min_interval_seconds: number | null;
  last_attempted_at: string | null;
  last_requested_at: string | null;
  last_request_id: number | null;
  last_mode: string | null;
  last_reason: string | null;
  last_skip_reason: string | null;
  last_error: string | null;
  total_attempts: number | null;
  total_scheduled: number | null;
  total_debounced: number | null;
  created_at: string;
  updated_at: string;
};

type WebPushDispatchQueueHealthDiagnosticsRow = {
  as_of: string;
  total_pending: number | null;
  total_retryable_failed: number | null;
  total_processing: number | null;
  total_done: number | null;
  total_dead_letter: number | null;
  total_skipped: number | null;
  claimable_now_count: number | null;
  pending_due_now_count: number | null;
  retryable_due_now_count: number | null;
  processing_lease_expired_count: number | null;
  oldest_claimable_age_seconds: number | null;
  oldest_pending_age_seconds: number | null;
  oldest_retryable_failed_age_seconds: number | null;
  oldest_processing_age_seconds: number | null;
  oldest_processing_lease_overdue_seconds: number | null;
  max_attempts_active: number | null;
  high_retry_attempt_count: number | null;
  dead_letter_last_60m_count: number | null;
  retryable_failed_last_10m_count: number | null;
  done_last_10m_count: number | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapNotificationItem = (row: NotificationListRow): NotificationItem => ({
  recipientId: row.recipient_id,
  eventId: row.event_id,
  kind: row.kind,
  sourceKind: row.source_kind,
  sourceId: row.source_id,
  actorUserId: row.actor_user_id,
  actorUsername: row.actor_username,
  actorAvatarUrl: row.actor_avatar_url,
  payload: asRecord(row.payload),
  deliverInApp: Boolean(row.deliver_in_app),
  deliverSound: Boolean(row.deliver_sound),
  createdAt: row.created_at,
  seenAt: row.seen_at,
  readAt: row.read_at,
  dismissedAt: row.dismissed_at,
});

const mapNotificationPreferences = (row: NotificationPreferencesRow): NotificationPreferences => ({
  userId: row.user_id,
  friendRequestInAppEnabled: Boolean(row.friend_request_in_app_enabled),
  friendRequestSoundEnabled: Boolean(row.friend_request_sound_enabled),
  friendRequestPushEnabled: Boolean(row.friend_request_push_enabled),
  dmInAppEnabled: Boolean(row.dm_in_app_enabled),
  dmSoundEnabled: Boolean(row.dm_sound_enabled),
  dmPushEnabled: Boolean(row.dm_push_enabled),
  mentionInAppEnabled: Boolean(row.mention_in_app_enabled),
  mentionSoundEnabled: Boolean(row.mention_sound_enabled),
  mentionPushEnabled: Boolean(row.mention_push_enabled),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWebPushSubscriptionRecord = (row: WebPushSubscriptionRow): WebPushSubscriptionRecord => ({
  id: row.id,
  userId: row.user_id,
  endpoint: row.endpoint,
  installationId: row.installation_id ?? null,
  p256dhKey: row.p256dh_key,
  authKey: row.auth_key,
  expirationTime: row.expiration_time,
  userAgent: row.user_agent,
  clientPlatform: row.client_platform,
  appDisplayMode: row.app_display_mode,
  metadata: asRecord(row.metadata),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSeenAt: row.last_seen_at,
});

const mapNotificationDeliveryTraceRecord = (
  row: NotificationDeliveryTraceRow
): NotificationDeliveryTraceRecord => ({
  id: row.id,
  notificationRecipientId: row.notification_recipient_id,
  notificationEventId: row.notification_event_id,
  recipientUserId: row.recipient_user_id,
  transport: row.transport as NotificationDeliveryTraceRecord['transport'],
  stage: row.stage as NotificationDeliveryTraceRecord['stage'],
  decision: row.decision as NotificationDeliveryTraceRecord['decision'],
  reasonCode: row.reason_code,
  details: asRecord(row.details),
  createdAt: row.created_at,
});

const mapWebPushDispatchWakeupDiagnostics = (
  row: WebPushDispatchWakeupDiagnosticsRow
): WebPushDispatchWakeupDiagnostics => ({
  enabled: Boolean(row.enabled),
  shadowMode: Boolean(row.shadow_mode),
  minIntervalSeconds: Math.max(1, Number(row.min_interval_seconds ?? 0) || 0),
  lastAttemptedAt: row.last_attempted_at,
  lastRequestedAt: row.last_requested_at,
  lastRequestId:
    typeof row.last_request_id === 'number' && Number.isFinite(row.last_request_id)
      ? Math.trunc(row.last_request_id)
      : null,
  lastMode: row.last_mode,
  lastReason: row.last_reason,
  lastSkipReason: row.last_skip_reason,
  lastError: row.last_error,
  totalAttempts: Math.max(0, Number(row.total_attempts ?? 0) || 0),
  totalScheduled: Math.max(0, Number(row.total_scheduled ?? 0) || 0),
  totalDebounced: Math.max(0, Number(row.total_debounced ?? 0) || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeNullableInt = (value: unknown): number | null => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.trunc(normalized);
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.trunc(normalized));
};

const mapWebPushDispatchQueueHealthDiagnostics = (
  row: WebPushDispatchQueueHealthDiagnosticsRow
): WebPushDispatchQueueHealthDiagnostics => ({
  asOf: row.as_of,
  totalPending: normalizeNonNegativeInt(row.total_pending),
  totalRetryableFailed: normalizeNonNegativeInt(row.total_retryable_failed),
  totalProcessing: normalizeNonNegativeInt(row.total_processing),
  totalDone: normalizeNonNegativeInt(row.total_done),
  totalDeadLetter: normalizeNonNegativeInt(row.total_dead_letter),
  totalSkipped: normalizeNonNegativeInt(row.total_skipped),
  claimableNowCount: normalizeNonNegativeInt(row.claimable_now_count),
  pendingDueNowCount: normalizeNonNegativeInt(row.pending_due_now_count),
  retryableDueNowCount: normalizeNonNegativeInt(row.retryable_due_now_count),
  processingLeaseExpiredCount: normalizeNonNegativeInt(row.processing_lease_expired_count),
  oldestClaimableAgeSeconds: normalizeNullableInt(row.oldest_claimable_age_seconds),
  oldestPendingAgeSeconds: normalizeNullableInt(row.oldest_pending_age_seconds),
  oldestRetryableFailedAgeSeconds: normalizeNullableInt(row.oldest_retryable_failed_age_seconds),
  oldestProcessingAgeSeconds: normalizeNullableInt(row.oldest_processing_age_seconds),
  oldestProcessingLeaseOverdueSeconds: normalizeNullableInt(
    row.oldest_processing_lease_overdue_seconds
  ),
  maxAttemptsActive: normalizeNullableInt(row.max_attempts_active),
  highRetryAttemptCount: normalizeNonNegativeInt(row.high_retry_attempt_count),
  deadLetterLast60mCount: normalizeNonNegativeInt(row.dead_letter_last_60m_count),
  retryableFailedLast10mCount: normalizeNonNegativeInt(row.retryable_failed_last_10m_count),
  doneLast10mCount: normalizeNonNegativeInt(row.done_last_10m_count),
});

export const centralNotificationBackend: NotificationBackend = {
  async listNotifications(input) {
    const { data, error } = await supabase.rpc(
      'list_my_notifications' as never,
      {
        p_limit: input?.limit ?? 50,
        p_before_created_at: input?.beforeCreatedAt ?? undefined,
        p_before_id: input?.beforeRecipientId ?? undefined,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as NotificationListRow[]).map(mapNotificationItem);
  },

  async listSoundNotifications(input) {
    const { data, error } = await supabase.rpc(
      'list_my_sound_notifications' as never,
      {
        p_limit: input?.limit ?? 50,
        p_before_created_at: input?.beforeCreatedAt ?? undefined,
        p_before_id: input?.beforeRecipientId ?? undefined,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as NotificationListRow[]).map(mapNotificationItem);
  },

  async listWebPushSubscriptions() {
    const { data, error } = await supabase.rpc('list_my_web_push_subscriptions' as never);
    if (error) throw error;
    return ((data ?? []) as WebPushSubscriptionRow[]).map(mapWebPushSubscriptionRecord);
  },

  async upsertWebPushSubscription(input) {
    const endpoint = input.endpoint?.trim();
    const p256dhKey = input.p256dhKey?.trim();
    const authKey = input.authKey?.trim();

    if (!endpoint) throw new Error('Web push subscription endpoint is required.');
    if (!p256dhKey) throw new Error('Web push subscription p256dh key is required.');
    if (!authKey) throw new Error('Web push subscription auth key is required.');

    const { data, error } = await supabase.rpc(
      'upsert_my_web_push_subscription' as never,
      {
        p_endpoint: endpoint,
        p_installation_id: input.installationId ?? null,
        p_p256dh_key: p256dhKey,
        p_auth_key: authKey,
        p_expiration_time: input.expirationTime ?? null,
        p_user_agent: input.userAgent ?? null,
        p_client_platform: input.clientPlatform ?? null,
        p_app_display_mode: input.appDisplayMode ?? null,
        p_metadata: input.metadata ?? {},
      } as never
    );
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : null) as WebPushSubscriptionRow | null;
    if (!row) {
      throw new Error('Web push subscription upsert returned no row.');
    }
    return mapWebPushSubscriptionRecord(row);
  },

  async deleteWebPushSubscription(endpoint) {
    const normalizedEndpoint = endpoint?.trim();
    if (!normalizedEndpoint) return false;

    const { data, error } = await supabase.rpc(
      'delete_my_web_push_subscription' as never,
      {
        p_endpoint: normalizedEndpoint,
      } as never
    );
    if (error) throw error;
    return Boolean(data);
  },

  async listNotificationDeliveryTraces(input) {
    const { data, error } = await supabase.rpc(
      'list_my_notification_delivery_traces' as never,
      {
        p_limit: input?.limit ?? 50,
        p_notification_recipient_id: input?.recipientId ?? null,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as NotificationDeliveryTraceRow[]).map(mapNotificationDeliveryTraceRecord);
  },

  async getWebPushDispatchWakeupDiagnostics() {
    const { data, error } = await supabase.rpc(
      'get_web_push_dispatch_wakeup_diagnostics' as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as WebPushDispatchWakeupDiagnosticsRow | null;
    return row ? mapWebPushDispatchWakeupDiagnostics(row) : null;
  },

  async getWebPushDispatchQueueHealthDiagnostics() {
    const { data, error } = await supabase.rpc(
      'get_web_push_dispatch_queue_health_diagnostics' as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as WebPushDispatchQueueHealthDiagnosticsRow | null;
    return row ? mapWebPushDispatchQueueHealthDiagnostics(row) : null;
  },

  async updateWebPushDispatchWakeupConfig(input) {
    const minIntervalSeconds =
      typeof input.minIntervalSeconds === 'number' && Number.isFinite(input.minIntervalSeconds)
        ? Math.trunc(input.minIntervalSeconds)
        : null;
    const { data, error } = await supabase.rpc(
      'update_web_push_dispatch_wakeup_config' as never,
      {
        p_enabled: typeof input.enabled === 'boolean' ? input.enabled : null,
        p_shadow_mode: typeof input.shadowMode === 'boolean' ? input.shadowMode : null,
        p_min_interval_seconds: minIntervalSeconds,
      } as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as WebPushDispatchWakeupDiagnosticsRow | null;
    if (!row) {
      throw new Error('Web push dispatch wakeup config update returned no row.');
    }
    return mapWebPushDispatchWakeupDiagnostics(row);
  },

  async getNotificationCounts() {
    const { data, error } = await supabase.rpc('get_my_notification_counts' as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as NotificationCountsRow | null;
    return {
      unseenCount: Number(row?.unseen_count ?? 0),
      unreadCount: Number(row?.unread_count ?? 0),
    };
  },

  async markNotificationsSeen(recipientIds) {
    const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;
    const { data, error } = await supabase.rpc(
      'mark_notifications_seen' as never,
      {
        p_recipient_ids: uniqueIds,
      } as never
    );
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  },

  async markNotificationsRead(recipientIds) {
    const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;
    const { data, error } = await supabase.rpc(
      'mark_notifications_read' as never,
      {
        p_recipient_ids: uniqueIds,
      } as never
    );
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  },

  async markAllNotificationsSeen() {
    const { data, error } = await supabase.rpc('mark_all_notifications_seen' as never);
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  },

  async dismissNotifications(recipientIds) {
    const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;
    const { data, error } = await supabase.rpc(
      'dismiss_notifications' as never,
      {
        p_recipient_ids: uniqueIds,
      } as never
    );
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  },

  async getNotificationPreferences() {
    const { data, error } = await supabase.rpc('get_my_notification_preferences' as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as NotificationPreferencesRow | null;
    if (!row) {
      throw new Error('Notification preferences were not returned.');
    }
    return mapNotificationPreferences(row);
  },

  async updateNotificationPreferences(input) {
    const { data, error } = await supabase.rpc(
      'update_my_notification_preferences' as never,
      {
        p_friend_request_in_app_enabled: input.friendRequestInAppEnabled,
        p_friend_request_sound_enabled: input.friendRequestSoundEnabled,
        p_friend_request_push_enabled: input.friendRequestPushEnabled,
        p_dm_in_app_enabled: input.dmInAppEnabled,
        p_dm_sound_enabled: input.dmSoundEnabled,
        p_dm_push_enabled: input.dmPushEnabled,
        p_mention_in_app_enabled: input.mentionInAppEnabled,
        p_mention_sound_enabled: input.mentionSoundEnabled,
        p_mention_push_enabled: input.mentionPushEnabled,
      } as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as NotificationPreferencesRow | null;
    if (!row) {
      throw new Error('Notification preferences update returned no row.');
    }
    return mapNotificationPreferences(row);
  },

  subscribeToNotificationInbox(userId, onChange) {
    return supabase
      .channel(`notification_inbox:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_recipients',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .subscribe();
  },
};
