import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from './types';

export interface NotificationBackend {
  listNotifications(input?: {
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeRecipientId?: string | null;
  }): Promise<NotificationItem[]>;
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
  dm_in_app_enabled: boolean;
  dm_sound_enabled: boolean;
  mention_in_app_enabled: boolean;
  mention_sound_enabled: boolean;
  created_at: string;
  updated_at: string;
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
  dmInAppEnabled: Boolean(row.dm_in_app_enabled),
  dmSoundEnabled: Boolean(row.dm_sound_enabled),
  mentionInAppEnabled: Boolean(row.mention_in_app_enabled),
  mentionSoundEnabled: Boolean(row.mention_sound_enabled),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
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
        p_dm_in_app_enabled: input.dmInAppEnabled,
        p_dm_sound_enabled: input.dmSoundEnabled,
        p_mention_in_app_enabled: input.mentionInAppEnabled,
        p_mention_sound_enabled: input.mentionSoundEnabled,
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
