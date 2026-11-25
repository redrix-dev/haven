/**
 * Friends and blocks: the person's friendships, the friend requests waiting
 * on either side, the people they blocked, and their friend links.
 * DATABASE.md: "Friends and blocks".
 *
 * A request exists only while it waits: accepting, declining or cancelling
 * removes it. A friendship is one row with the smaller id first. A block is
 * visible only to the person who made it. All of it arrives in one load and
 * stays current from `friend_request.*`, `friendship.*` and `block.*`; the
 * links load again on `friend_links.changed`.
 *
 * A friend link someone else made is opened (`openLink`), which only shows
 * who it is from, and then answered or put away. Both platforms show the
 * same question from `openedLink`.
 *
 * Nothing here is kept on the device: who someone's friends are, who they
 * blocked, and their links' codes stay off the disk.
 */

import type {
  FriendLinkOptions,
  SocialBackend,
} from "@shared/lib/backend/social";
import type {
  Block,
  FriendLink,
  FriendLinkRecord,
  FriendRequest,
  Friendship,
} from "@shared/lib/backend/records";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRows, putRowsBy } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** A friendship's key: the two ids, smaller first, as the database stores them. */
export const friendshipKey = (friendship: Friendship) =>
  `${friendship.user_low_id}:${friendship.user_high_id}`;

export type SocialState = {
  /** Waiting requests, sent and received, by request id. */
  friendRequests: ById<FriendRequest>;
  /** By `friendshipKey`. */
  friendships: ById<Friendship>;
  /** By the blocked person's id. */
  blocks: ById<Block>;
  /** The person's own links, by id. */
  friendLinks: ById<FriendLink>;
  /** Someone else's link the person opened and has not answered. */
  openedLink: OpenedLink | null;
  requests: RequestMap;
};

export type OpenedLink = { code: string; from: FriendLinkRecord };

export const createSocialState = (): SocialState => ({
  friendRequests: {},
  friendships: {},
  blocks: {},
  friendLinks: {},
  openedLink: null,
  requests: {},
});

export type SocialBackendPart = Pick<
  SocialBackend,
  | "loadSocial"
  | "sendFriendRequest"
  | "answerFriendRequest"
  | "removeFriend"
  | "blockUser"
  | "unblockUser"
  | "listMyFriendLinks"
  | "createFriendLink"
  | "revokeFriendLink"
  | "getFriendLink"
  | "answerFriendLink"
>;

const friendsWith = (userId: string) => (friendship: Friendship) =>
  friendship.user_low_id === userId || friendship.user_high_id === userId;

const requestWith = (userId: string) => (request: FriendRequest) =>
  request.sender_id === userId || request.recipient_id === userId;

export class Social {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<SocialState>,
    private readonly backend: SocialBackendPart,
  ) {
    this.requests = new Requests("social", port);
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /** Everything at once, replacing what is held. Also the reconnect reload. */
  load(): Promise<void> {
    return this.requests.run("all", async (stale) => {
      const { requests, friendships, blocks, links } =
        await this.backend.loadSocial();
      if (stale()) return;
      this.port.set({
        friendRequests: putRows({}, requests),
        friendships: putRowsBy({}, friendships, friendshipKey),
        blocks: putRowsBy({}, blocks, (block) => block.blocked_id),
        friendLinks: putRows({}, links),
      });
    });
  }

  /** The person's links again: the answer to `friend_links.changed`. */
  loadLinks(): Promise<void> {
    return this.requests.refresh("links", async (stale) => {
      const links = await this.backend.listMyFriendLinks();
      if (stale()) return;
      this.port.set({ friendLinks: putRows({}, links) });
    });
  }

  /**
   * Someone else's link, from a deep link or a pasted code: who it is from,
   * for the person to decide. Nothing else happens, and the owner is not
   * told. A link that cannot be used any more is the status's error
   * (`link_invalid`), with nothing opened.
   */
  openLink(code: string): Promise<void> {
    this.port.set({ openedLink: null });
    return this.requests.refresh("opened_link", async (stale) => {
      const from = await this.backend.getFriendLink(code);
      if (stale()) return;
      this.port.set({ openedLink: { code, from } });
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Asks someone to be friends. If they had already asked, this accepts
   * instead: the friendship arrives as an event.
   */
  async sendRequest(userId: string): Promise<void> {
    const request = await this.backend.sendFriendRequest(userId);
    if (request) this.applyRequest(request);
  }

  /** Accepting makes a friendship (it arrives as an event); either way the request is done. */
  async answerRequest(requestId: string, accept: boolean): Promise<void> {
    await this.backend.answerFriendRequest(requestId, accept);
    this.applyRequestDeleted(requestId);
  }

  async removeFriend(userId: string): Promise<void> {
    await this.backend.removeFriend(userId);
    this.port.set({
      friendships: dropWhere(this.port.get().friendships, friendsWith(userId)),
    });
  }

  /**
   * Ends any friendship or request between the two, as the database does.
   * The block itself arrives as an event: only the database has its row.
   */
  async block(userId: string): Promise<void> {
    await this.backend.blockUser(userId);
    const state = this.port.get();
    this.port.set({
      friendships: dropWhere(state.friendships, friendsWith(userId)),
      friendRequests: dropWhere(state.friendRequests, requestWith(userId)),
    });
  }

  /** Returns the link, whose code is for the person to hand out. */
  async createLink(options?: FriendLinkOptions): Promise<FriendLink> {
    const link = await this.backend.createFriendLink(options);
    this.port.set({
      friendLinks: putRows(this.port.get().friendLinks, [link]),
    });
    return link;
  }

  async revokeLink(linkId: string): Promise<void> {
    await this.backend.revokeFriendLink(linkId);
    this.port.set({
      friendLinks: dropIds(this.port.get().friendLinks, [linkId]),
    });
  }

  /**
   * Answers the link that is open. Accepting makes the two friends (the
   * friendship arrives as an event); declining tells the owner only that
   * someone declined. Refused, it stays open for the screen to say why.
   */
  async answerOpenedLink(accept: boolean): Promise<void> {
    const opened = this.port.get().openedLink;
    if (!opened) return;
    await this.backend.answerFriendLink(opened.code, accept);
    this.closeOpenedLink();
  }

  /** Puts it away unanswered. The owner hears nothing, and the link still works. */
  closeOpenedLink(): void {
    this.requests.forget("opened_link");
    this.port.set({ openedLink: null });
  }

  async unblock(userId: string): Promise<void> {
    await this.backend.unblockUser(userId);
    this.port.set({ blocks: dropIds(this.port.get().blocks, [userId]) });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  applyRequest(request: FriendRequest): void {
    this.port.set({
      friendRequests: putRows(this.port.get().friendRequests, [request]),
    });
  }

  applyRequestDeleted(requestId: string): void {
    this.port.set({
      friendRequests: dropIds(this.port.get().friendRequests, [requestId]),
    });
  }

  applyFriendship(friendship: Friendship): void {
    this.port.set({
      friendships: putRowsBy(
        this.port.get().friendships,
        [friendship],
        friendshipKey,
      ),
    });
  }

  applyFriendshipDeleted(friendship: Friendship): void {
    this.port.set({
      friendships: dropIds(this.port.get().friendships, [
        friendshipKey(friendship),
      ]),
    });
  }

  applyBlock(block: Block): void {
    this.port.set({
      blocks: putRowsBy(this.port.get().blocks, [block], (b) => b.blocked_id),
    });
  }

  applyBlockDeleted(block: Block): void {
    this.port.set({
      blocks: dropIds(this.port.get().blocks, [block.blocked_id]),
    });
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createSocialState());
  }
}
