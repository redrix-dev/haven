import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type {
  NotificationCounts,
  NotificationDeliveryTraceRecord,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
  ExpoPushSubscriptionRecord,
  ExpoPushSubscriptionUpsertInput,
} from "./types";

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
  listExpoPushSubscriptions(): Promise<ExpoPushSubscriptionRecord[]>;
  upsertExpoPushSubscription(
    input: ExpoPushSubscriptionUpsertInput,
  ): Promise<ExpoPushSubscriptionRecord>;
  deleteExpoPushSubscription(expoPushToken: string): Promise<boolean>;
  listNotificationDeliveryTraces(input?: {
    limit?: number;
    recipientId?: string | null;
  }): Promise<NotificationDeliveryTraceRecord[]>;
  getNotificationCounts(): Promise<NotificationCounts>;
  markNotificationsSeen(recipientIds: string[]): Promise<number>;
  /** No matching “mark unread” RPC exists yet; clients should not expose unread toggles until one lands. */
  markNotificationsRead(recipientIds: string[]): Promise<number>;
  markAllNotificationsSeen(): Promise<number>;
  dismissNotifications(recipientIds: string[]): Promise<number>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(
    input: NotificationPreferenceUpdate,
  ): Promise<NotificationPreferences>;
}

type NotificationListRow = {
  recipient_id: string;
  event_id: string;
  kind: NotificationItem["kind"];
  source_kind: NotificationItem["sourceKind"];
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

type ExpoPushSubscriptionRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string;
  installation_id: string | null;
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
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

const mapNotificationPreferences = (
  row: NotificationPreferencesRow,
): NotificationPreferences => ({
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

const mapExpoPushSubscriptionRecord = (
  row: ExpoPushSubscriptionRow,
): ExpoPushSubscriptionRecord => ({
  id: row.id,
  userId: row.user_id,
  expoPushToken: row.expo_push_token,
  platform: row.platform,
  installationId: row.installation_id ?? null,
  metadata: asRecord(row.metadata),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSeenAt: row.last_seen_at,
});

const mapNotificationDeliveryTraceRecord = (
  row: NotificationDeliveryTraceRow,
): NotificationDeliveryTraceRecord => ({
  id: row.id,
  notificationRecipientId: row.notification_recipient_id,
  notificationEventId: row.notification_event_id,
  recipientUserId: row.recipient_user_id,
  transport: row.transport as NotificationDeliveryTraceRecord["transport"],
  stage: row.stage as NotificationDeliveryTraceRecord["stage"],
  decision: row.decision as NotificationDeliveryTraceRecord["decision"],
  reasonCode: row.reason_code,
  details: asRecord(row.details),
  createdAt: row.created_at,
});

export function createNotificationBackend(
  client: HavenSupabaseClient,
): NotificationBackend {
  return {
    async listNotifications(input) {
      const { data, error } = await client.rpc(
        "list_my_notifications" as never,
        {
          p_limit: input?.limit ?? 50,
          p_before_created_at: input?.beforeCreatedAt ?? undefined,
          p_before_id: input?.beforeRecipientId ?? undefined,
        } as never,
      );
      if (error) throw error;
      return ((data ?? []) as NotificationListRow[]).map(mapNotificationItem);
    },

    async listSoundNotifications(input) {
      const { data, error } = await client.rpc(
        "list_my_sound_notifications" as never,
        {
          p_limit: input?.limit ?? 50,
          p_before_created_at: input?.beforeCreatedAt ?? undefined,
          p_before_id: input?.beforeRecipientId ?? undefined,
        } as never,
      );
      if (error) throw error;
      return ((data ?? []) as NotificationListRow[]).map(mapNotificationItem);
    },

    async listExpoPushSubscriptions() {
      const { data, error } = await client.rpc(
        "list_my_expo_push_subscriptions" as never,
      );
      if (error) throw error;
      return ((data ?? []) as ExpoPushSubscriptionRow[]).map(
        mapExpoPushSubscriptionRecord,
      );
    },

    async upsertExpoPushSubscription(input) {
      const token = input.expoPushToken?.trim();
      if (!token) throw new Error("Expo push token is required.");

      const platform = input.platform ?? "unknown";

      const { data, error } = await client.rpc(
        "upsert_my_expo_push_subscription" as never,
        {
          p_expo_push_token: token,
          p_platform: platform,
          p_installation_id: input.installationId ?? null,
          p_metadata: input.metadata ?? {},
        } as never,
      );
      if (error) throw error;

      const row = (
        Array.isArray(data) ? data[0] : null
      ) as ExpoPushSubscriptionRow | null;
      if (!row) {
        throw new Error("Expo push subscription upsert returned no row.");
      }
      return mapExpoPushSubscriptionRecord(row);
    },

    async deleteExpoPushSubscription(expoPushToken) {
      const normalized = expoPushToken?.trim();
      if (!normalized) return false;

      const { data, error } = await client.rpc(
        "delete_my_expo_push_subscription" as never,
        {
          p_expo_push_token: normalized,
        } as never,
      );
      if (error) throw error;
      return Boolean(data);
    },

    async listNotificationDeliveryTraces(input) {
      const { data, error } = await client.rpc(
        "list_my_notification_delivery_traces" as never,
        {
          p_limit: input?.limit ?? 50,
          p_notification_recipient_id: input?.recipientId ?? null,
        } as never,
      );
      if (error) throw error;
      return ((data ?? []) as NotificationDeliveryTraceRow[]).map(
        mapNotificationDeliveryTraceRecord,
      );
    },

    async getNotificationCounts() {
      const { data, error } = await client.rpc(
        "get_my_notification_counts" as never,
      );
      if (error) throw error;
      const row = (
        Array.isArray(data) ? data[0] : null
      ) as NotificationCountsRow | null;
      return {
        unseenCount: Number(row?.unseen_count ?? 0),
        unreadCount: Number(row?.unread_count ?? 0),
      };
    },

    async markNotificationsSeen(recipientIds) {
      const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
      if (uniqueIds.length === 0) return 0;
      const { data, error } = await client.rpc(
        "mark_notifications_seen" as never,
        {
          p_recipient_ids: uniqueIds,
        } as never,
      );
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },

    async markNotificationsRead(recipientIds) {
      const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
      if (uniqueIds.length === 0) return 0;
      const { data, error } = await client.rpc(
        "mark_notifications_read" as never,
        {
          p_recipient_ids: uniqueIds,
        } as never,
      );
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },

    async markAllNotificationsSeen() {
      const { data, error } = await client.rpc(
        "mark_all_notifications_seen" as never,
      );
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },

    async dismissNotifications(recipientIds) {
      const uniqueIds = Array.from(new Set(recipientIds.filter(Boolean)));
      if (uniqueIds.length === 0) return 0;
      const { data, error } = await client.rpc(
        "dismiss_notifications" as never,
        {
          p_recipient_ids: uniqueIds,
        } as never,
      );
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },

    async getNotificationPreferences() {
      const { data, error } = await client.rpc(
        "get_my_notification_preferences" as never,
      );
      if (error) throw error;
      const row = (
        Array.isArray(data) ? data[0] : null
      ) as NotificationPreferencesRow | null;
      if (!row) {
        throw new Error("Notification preferences were not returned.");
      }
      return mapNotificationPreferences(row);
    },

    async updateNotificationPreferences(input) {
      const { data, error } = await client.rpc(
        "update_my_notification_preferences" as never,
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
        } as never,
      );
      if (error) throw error;
      const row = (
        Array.isArray(data) ? data[0] : null
      ) as NotificationPreferencesRow | null;
      if (!row) {
        throw new Error("Notification preferences update returned no row.");
      }
      return mapNotificationPreferences(row);
    },
  };
}
