/**
 * Realtime. DATABASE.md: "Realtime".
 *
 * Each person listens on one private topic, `user:<their id>`. The database
 * decides who hears about every change and sends it there, so the app never
 * subscribes to a table, a channel or a community. `HavenEvent` below is the
 * complete list of what can arrive, with what each carries.
 *
 * Delivery is not guaranteed: an app that was offline misses events. When
 * the topic (re)connects, `onConnected` fires and the app reloads what it
 * shows; time-ordered ids make "what is newer than what I have" cheap.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type {
  AccountRestriction,
  Block,
  Channel,
  ChannelCategory,
  Community,
  CommunityMember,
  CommunityReportRecord,
  FriendRequest,
  Friendship,
  MessageRecord,
  Notification,
  ProfileRecord,
  Role,
  VoiceControlAction,
} from "./records";

export type VoiceControl = {
  channel_id: string;
  community_id: string;
  channel_name: string;
  target_user_id: string;
  target_session_id: string;
  actor_id: string;
  actor_name: string | null;
  action: VoiceControlAction;
};

/** Every event the database sends, by name, with what it carries. */
export type HavenEventMap = {
  "message.created": MessageRecord;
  "message.updated": MessageRecord;
  "message.deleted": { id: string; channel_id: string };
  "channel.created": Channel;
  "channel.updated": Channel;
  "channel.deleted": Channel;
  /** The caller read a channel on another device. */
  "channel.read": { channel_id: string; last_read_message_id: string };
  "community.updated": Community;
  "community.deleted": { id: string };
  "role.created": Role;
  "role.updated": Role;
  "role.deleted": Role;
  "category.created": ChannelCategory;
  "category.updated": ChannelCategory;
  "category.deleted": ChannelCategory;
  "member.joined": CommunityMember;
  "member.updated": CommunityMember;
  /** Also sent to the person who left or was removed. */
  "member.left": CommunityMember;
  "member.banned": { community_id: string; user_id: string };
  "member.unbanned": { community_id: string; user_id: string };
  /**
   * What the caller may see or do in this community may have changed: reload
   * its permissions, roles and channels.
   */
  "access.changed": { community_id: string };
  "profile.updated": ProfileRecord;
  "friend_request.created": FriendRequest;
  "friend_request.deleted": FriendRequest;
  "friendship.created": Friendship;
  "friendship.deleted": Friendship;
  "block.created": Block;
  "block.deleted": Block;
  /** One of the caller's friend links was made, used, expired or revoked: reload them. */
  "friend_links.changed": Record<string, never>;
  "notification.created": Notification;
  /** Some of the caller's notifications were marked or removed: reload them. */
  "notifications.changed": Record<string, never>;
  "report.created": CommunityReportRecord;
  "report.updated": CommunityReportRecord;
  /** Staff only: reload this case. */
  "case.changed": { id: string };
  /** Something in the caller's own account changed, on any device: reload it. */
  "account.changed": Record<string, never>;
  "account.restricted": Pick<AccountRestriction, "ends_at">;
  "voice.control": VoiceControl;
};

export type HavenEventName = keyof HavenEventMap;

export type HavenEvent = {
  [Name in HavenEventName]: { event: Name; payload: HavenEventMap[Name] };
}[HavenEventName];

const EVENT_NAMES = new Set<string>([
  "message.created",
  "message.updated",
  "message.deleted",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "channel.read",
  "community.updated",
  "community.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "category.created",
  "category.updated",
  "category.deleted",
  "member.joined",
  "member.updated",
  "member.left",
  "member.banned",
  "member.unbanned",
  "access.changed",
  "profile.updated",
  "friend_request.created",
  "friend_request.deleted",
  "friendship.created",
  "friendship.deleted",
  "block.created",
  "block.deleted",
  "friend_links.changed",
  "notification.created",
  "notifications.changed",
  "report.created",
  "report.updated",
  "case.changed",
  "account.changed",
  "account.restricted",
  "voice.control",
] satisfies HavenEventName[]);

/**
 * Reads one broadcast as a HavenEvent, or null for anything else. The
 * payload is trusted to match its name: only the database can send on a
 * person's topic.
 */
export function readHavenEvent(broadcast: unknown): HavenEvent | null {
  const envelope = broadcast as { event?: unknown; payload?: unknown } | null;
  if (
    typeof envelope?.event !== "string" ||
    !EVENT_NAMES.has(envelope.event) ||
    typeof envelope.payload !== "object" ||
    envelope.payload === null
  ) {
    return null;
  }
  return { event: envelope.event, payload: envelope.payload } as HavenEvent;
}

export type MyEventsOptions = {
  onEvent: (event: HavenEvent) => void;
  /** The topic is listening: first thing, and again after every reconnect. */
  onConnected?: () => void;
  /** The topic could not be joined or dropped; it retries by itself. */
  onTrouble?: (status: string) => void;
};

export const userTopic = (userId: string) => `user:${userId}`;
export const voiceTopic = (channelId: string) => `voice:${channelId}`;

export function createRealtimeBackend(client: HavenSupabaseClient) {
  return {
    /**
     * Listens on the caller's own topic. Returns a function that stops.
     * The topic is private, so it is joined with the caller's token, and the
     * token is passed on again whenever Auth refreshes it.
     */
    subscribeToMyEvents(userId: string, options: MyEventsOptions): () => void {
      let stopped = false;
      let channel: RealtimeChannel | null = null;

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        if (stopped) return;
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
          void client.realtime.setAuth(session?.access_token ?? null);
        }
      });

      void (async () => {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (stopped) return;
        await client.realtime.setAuth(session?.access_token ?? null);
        if (stopped) return;
        channel = client
          .channel(userTopic(userId), { config: { private: true } })
          .on("broadcast", { event: "*" }, (broadcast) => {
            const event = readHavenEvent(broadcast);
            if (event) options.onEvent(event);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") options.onConnected?.();
            else if (status !== "CLOSED") options.onTrouble?.(status);
          });
      })();

      return () => {
        stopped = true;
        subscription.unsubscribe();
        if (channel) void client.removeChannel(channel);
      };
    },

    /**
     * The presence topic of one voice channel: who is in it. Joining needs
     * the right to see the channel, and presence is all a client may send.
     * `presenceKey` is the caller's id when they will announce themselves.
     */
    voicePresence(channelId: string, presenceKey?: string): RealtimeChannel {
      return client.channel(voiceTopic(channelId), {
        config: {
          private: true,
          ...(presenceKey ? { presence: { key: presenceKey } } : {}),
        },
      });
    },

    removeChannel(channel: RealtimeChannel): Promise<unknown> {
      return client.removeChannel(channel);
    },
  };
}

export type RealtimeBackend = ReturnType<typeof createRealtimeBackend>;
