/**
 * Messages, reactions and link previews. DATABASE.md: "Messages".
 *
 * Every call here returns `MessageRecord`, the same shape the realtime events
 * carry, so a message from a page and a message from an event are the same
 * object and can replace each other without converting anything.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rpc, rpcRows } from "./client";
import type { MessageRecord } from "./records";

export type MessagePage = {
  /** Older than this message (scrolling up). */
  before_id?: string;
  /** Newer than this message (catching up after being away). */
  after_id?: string;
  /** At most 100; 50 when left out. */
  limit?: number;
};

export type NewMessage = {
  /**
   * The app's name for this send, a random UUID made once per message. The
   * stored message and its event carry it back, so the app can swap the copy
   * it showed for the real one; sending it again is a retry, sent once.
   */
  nonce: string;
  body: string;
  reply_to_id?: string;
  /** Uploads made with media.uploadFile, in the order to show them. */
  attachment_ids?: string[];
};

export function createMessagesBackend(client: HavenSupabaseClient) {
  return {
    /** A page of a channel, newest first, whichever direction was asked for. */
    async listMessages(
      channelId: string,
      page: MessagePage = {},
    ): Promise<MessageRecord[]> {
      return rpcRows<MessageRecord>(client, "list_messages", {
        p_channel_id: channelId,
        p_before_id: page.before_id,
        p_after_id: page.after_id,
        p_limit: page.limit,
      });
    },

    /** These messages, where the caller may see them. Others are left out. */
    async getMessages(messageIds: string[]): Promise<MessageRecord[]> {
      if (messageIds.length === 0) return [];
      return rpcRows<MessageRecord>(client, "get_messages", {
        p_message_ids: messageIds,
      });
    },

    /** The newest message of each channel, for a sidebar or a conversation list. */
    async getLatestMessages(channelIds: string[]): Promise<MessageRecord[]> {
      if (channelIds.length === 0) return [];
      return rpcRows<MessageRecord>(client, "get_latest_messages", {
        p_channel_ids: channelIds,
      });
    },

    async sendMessage(
      channelId: string,
      message: NewMessage,
    ): Promise<MessageRecord> {
      return (await rpc(client, "send_message", {
        p_channel_id: channelId,
        p_body: message.body,
        p_reply_to_id: message.reply_to_id,
        p_attachment_ids: message.attachment_ids,
        p_nonce: message.nonce,
      })) as MessageRecord;
    },

    /** Only the author edits. */
    async editMessage(messageId: string, body: string): Promise<MessageRecord> {
      return (await rpc(client, "edit_message", {
        p_message_id: messageId,
        p_body: body,
      })) as MessageRecord;
    },

    /** The author, or someone with `manage_messages`. Deleted for real. */
    async deleteMessage(messageId: string): Promise<void> {
      await rpc(client, "delete_message", { p_message_id: messageId });
    },

    async setReaction(
      messageId: string,
      emoji: string,
      on: boolean,
    ): Promise<void> {
      await rpc(client, "set_reaction", {
        p_message_id: messageId,
        p_emoji: emoji,
        p_on: on,
      });
    },

    /** Fetch the message's link again. The author, or `manage_messages`. */
    async refreshLinkPreview(messageId: string): Promise<void> {
      await rpc(client, "refresh_link_preview", { p_message_id: messageId });
    },
  };
}

export type MessagesBackend = ReturnType<typeof createMessagesBackend>;
