/**
 * Channels, conversations and read state. DATABASE.md: "Channels and
 * conversations".
 *
 * A direct conversation is a channel of kind `dm` with two participants, and
 * uses the same send, list, read and mute calls as any channel. Who may see,
 * send in or manage a channel is decided by the database alone; the channels
 * a caller can read here are exactly the ones they may see.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rows, rpc, rpcRows } from "./client";
import type {
  Channel,
  ChannelKind,
  ChannelOverwrite,
  ChannelParticipant,
  ChannelUserState,
  UnreadCount,
} from "./records";

/**
 * A permission exception on one channel, for one role or one member.
 * `null` means "no exception": the community-wide permission decides.
 */
export type OverwriteValues = {
  can_view: boolean | null;
  can_send: boolean | null;
  can_manage: boolean | null;
};

export type OverwriteTarget = { role_id: string } | { user_id: string };

/** The caller's conversations, each with the people in it. */
export type Conversations = {
  channels: Channel[];
  participants: ChannelParticipant[];
};

export function createChannelsBackend(client: HavenSupabaseClient) {
  return {
    /** The channels of one community the caller may see, in order. */
    async listCommunityChannels(communityId: string): Promise<Channel[]> {
      return rows(
        await client
          .from("channels")
          .select("*")
          .eq("community_id", communityId)
          .order("position")
          .order("id"),
      );
    },

    async listConversations(): Promise<Conversations> {
      const channels = rows(
        await client
          .from("channels")
          .select("*")
          .eq("kind", "dm")
          .order("latest_message_id", {
            ascending: false,
            nullsFirst: false,
          }),
      );
      if (channels.length === 0) return { channels, participants: [] };
      const participants = rows(
        await client
          .from("channel_participants")
          .select("*")
          .in(
            "channel_id",
            channels.map((channel) => channel.id),
          ),
      );
      return { channels, participants };
    },

    /** The conversation with this person, made if it does not exist yet. */
    async openConversation(userId: string): Promise<Channel> {
      return (await rpc(client, "open_dm", { p_user_id: userId })) as Channel;
    },

    async createChannel(
      communityId: string,
      kind: Exclude<ChannelKind, "dm">,
      name: string,
      options: { topic?: string; category_id?: string } = {},
    ): Promise<Channel> {
      return (await rpc(client, "create_channel", {
        p_community_id: communityId,
        p_kind: kind,
        p_name: name,
        p_topic: options.topic,
        p_category_id: options.category_id,
      })) as Channel;
    },

    async updateChannel(
      channelId: string,
      changes: { name?: string; topic?: string },
    ): Promise<Channel> {
      return (await rpc(client, "update_channel", {
        p_channel_id: channelId,
        p_name: changes.name,
        p_topic: changes.topic,
      })) as Channel;
    },

    /** Null category puts it outside any category. */
    async moveChannel(
      channelId: string,
      categoryId: string | null,
      position: number,
    ): Promise<Channel> {
      return (await rpc(client, "move_channel", {
        p_channel_id: channelId,
        p_category_id: categoryId,
        p_position: position,
      })) as Channel;
    },

    async deleteChannel(channelId: string): Promise<void> {
      await rpc(client, "delete_channel", { p_channel_id: channelId });
    },

    /** Needs `manage_channel_permissions`; returns nothing without it. */
    async listOverwrites(channelId: string): Promise<ChannelOverwrite[]> {
      return rows(
        await client
          .from("channel_overwrites")
          .select("*")
          .eq("channel_id", channelId),
      );
    },

    /** All three null removes the exception. */
    async setOverwrite(
      channelId: string,
      target: OverwriteTarget,
      values: OverwriteValues,
    ): Promise<void> {
      await rpc(client, "set_channel_overwrite", {
        p_channel_id: channelId,
        p_role_id: "role_id" in target ? target.role_id : null,
        p_user_id: "user_id" in target ? target.user_id : null,
        p_can_view: values.can_view,
        p_can_send: values.can_send,
        p_can_manage: values.can_manage,
      });
    },

    // ── The caller's own state ──────────────────────────────────────────────
    /** Read marks and mutes, for every channel the caller has either in. */
    async listMyChannelState(): Promise<ChannelUserState[]> {
      return rows(await client.from("channel_user_state").select("*"));
    },

    /**
     * Unread messages per channel, counted up to 100 ("99+" is enough).
     * Channels with nothing unread are left out.
     */
    async getUnreadCounts(): Promise<UnreadCount[]> {
      return rpcRows<UnreadCount>(client, "get_unread_counts", {});
    },

    /** Everything up to and including this message is read. Never moves back. */
    async markRead(channelId: string, messageId: string): Promise<void> {
      await rpc(client, "mark_channel_read", {
        p_channel_id: channelId,
        p_message_id: messageId,
      });
    },

    /** Null unmutes. A date far ahead is "until I unmute it". */
    async muteChannel(channelId: string, until: string | null): Promise<void> {
      await rpc(client, "mute_channel", {
        p_channel_id: channelId,
        p_until: until,
      });
    },
  };
}

export type ChannelsBackend = ReturnType<typeof createChannelsBackend>;
