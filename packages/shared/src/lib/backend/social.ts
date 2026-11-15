/**
 * Friends, friend links and blocks. DATABASE.md: "Friends and blocks".
 *
 * A request row exists only while it waits. A friendship is one row, the
 * smaller id first. A block is visible only to the person who made it. A
 * friend link is the person's own invitation; opening one shows who it is
 * from, and only answering it does anything.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rows, rpc, rpcRows } from "./client";
import type {
  Block,
  FriendLink,
  FriendLinkRecord,
  FriendRequest,
  Friendship,
} from "./records";

export type SocialState = {
  /** Requests the caller sent or received that are still waiting. */
  requests: FriendRequest[];
  friendships: Friendship[];
  /** People the caller blocked. */
  blocks: Block[];
  /** The caller's own friend links, until a week after they expire. */
  links: FriendLink[];
};

export type FriendLinkOptions = {
  /** Defaults to 1. Null: any number. */
  max_uses?: number | null;
  /** 1 to 720; defaults to a week. */
  expires_in_hours?: number;
};

/** The other person in a friendship. */
export function friendOf(friendship: Friendship, me: string): string {
  return friendship.user_low_id === me
    ? friendship.user_high_id
    : friendship.user_low_id;
}

export function createSocialBackend(client: HavenSupabaseClient) {
  const social = {
    /** Everything at once, for a first load or a reload after reconnecting. */
    async loadSocial(): Promise<SocialState> {
      const [requests, friendships, blocks, links] = await Promise.all([
        client.from("friend_requests").select("*").order("id"),
        client.from("friendships").select("*").order("created_at"),
        client.from("blocks").select("*").order("created_at"),
        social.listMyFriendLinks(),
      ]);
      return {
        requests: rows(requests),
        friendships: rows(friendships),
        blocks: rows(blocks),
        links,
      };
    },

    /** Newest first. */
    async listMyFriendLinks(): Promise<FriendLink[]> {
      return rows(
        await client
          .from("friend_links")
          .select("*")
          .order("id", { ascending: false }),
      );
    },

    async createFriendLink(
      options: FriendLinkOptions = {},
    ): Promise<FriendLink> {
      return (await rpc(client, "create_friend_link", {
        p_max_uses: options.max_uses === undefined ? 1 : options.max_uses,
        p_expires_in_hours: options.expires_in_hours ?? 168,
      })) as FriendLink;
    },

    async revokeFriendLink(linkId: string): Promise<void> {
      await rpc(client, "revoke_friend_link", { p_link_id: linkId });
    },

    /**
     * Who a link is from. Opening it does nothing else: the owner is not
     * told. Refused (`link_invalid`) once it expired, was used up or revoked.
     */
    async getFriendLink(code: string): Promise<FriendLinkRecord> {
      return (await rpc(client, "get_friend_link", {
        p_code: code,
      })) as FriendLinkRecord;
    },

    /**
     * Accepting makes the two friends (the friendship arrives as an event)
     * and the owner is told who. Declining tells the owner only that
     * someone declined.
     */
    async answerFriendLink(code: string, accept: boolean): Promise<void> {
      await rpc(client, "answer_friend_link", {
        p_code: code,
        p_accept: accept,
      });
    },

    /**
     * Asks someone to be friends. If they had already asked the caller, this
     * accepts instead and returns null: they are friends now.
     */
    async sendFriendRequest(userId: string): Promise<FriendRequest | null> {
      const [request] = await rpcRows<FriendRequest>(
        client,
        "send_friend_request",
        { p_user_id: userId },
      );
      return request ?? null;
    },

    /** Accepting makes a friendship; declining, or the sender cancelling, removes it. */
    async answerFriendRequest(
      requestId: string,
      accept: boolean,
    ): Promise<void> {
      await rpc(client, "answer_friend_request", {
        p_request_id: requestId,
        p_accept: accept,
      });
    },

    async removeFriend(userId: string): Promise<void> {
      await rpc(client, "remove_friend", { p_user_id: userId });
    },

    /** Ends any friendship or request between the two of you. */
    async blockUser(userId: string): Promise<void> {
      await rpc(client, "block_user", { p_user_id: userId });
    },

    async unblockUser(userId: string): Promise<void> {
      await rpc(client, "unblock_user", { p_user_id: userId });
    },
  };
  return social;
}

export type SocialBackend = ReturnType<typeof createSocialBackend>;
