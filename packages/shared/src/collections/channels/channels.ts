/**
 * Channels: every channel the person can see, community channels and direct
 * conversations alike (a conversation is a channel of kind `dm`), with the
 * person's own read mark, mute and unread count on each.
 * DATABASE.md: "Channels and conversations".
 *
 * Which channels exist and who may see them is the database's answer; this
 * holds that answer and keeps it current from events. It does not decide
 * which channel is open (session state) or hold any messages (`messages`).
 */

import type { ChannelsBackend } from "@shared/lib/backend/channels";
import type {
  Channel,
  ChannelKind,
  ChannelUserState,
  MessageRecord,
} from "@shared/lib/backend/records";
import type { DeviceCopy } from "../kit/deviceCopies";
import { isNewer, newest } from "../kit/ids";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** `get_unread_counts` stops counting here; the app shows "99+". */
export const UNREAD_CAP = 100;

export type ChannelsState = {
  byId: ById<Channel>;
  /** The people in each conversation, by its channel id. */
  participants: Readonly<Record<string, readonly string[]>>;
  /** The person's read mark and mute, by channel id. */
  mine: ById<MyChannelState>;
  /** Unread messages by channel id, up to UNREAD_CAP. Absent means none. */
  unread: Readonly<Record<string, number>>;
  requests: RequestMap;
};

/** The person's own row of `channel_user_state`; `user_id` is always them. */
export type MyChannelState = Pick<
  ChannelUserState,
  "channel_id" | "last_read_message_id" | "muted_until"
>;

export const createChannelsState = (): ChannelsState => ({
  byId: {},
  participants: {},
  mine: {},
  unread: {},
  requests: {},
});

/**
 * Kept on the device: each community's channels, so the sidebar is there at
 * launch. Not conversations (who someone talks to stays off the disk), not
 * read marks or counts, which are out of date by the next launch anyway.
 */
export const channelsCopy: DeviceCopy<ChannelsState, Channel[]> = {
  name: "channels",
  version: 1,
  pick: (state) =>
    Object.values(state.byId).filter((channel) => channel.kind !== "dm"),
  restore: (saved) => ({ byId: putRows({}, saved) }),
};

export type ChannelsBackendPart = Pick<
  ChannelsBackend,
  | "listCommunityChannels"
  | "listConversations"
  | "listMyChannelState"
  | "getUnreadCounts"
  | "markRead"
  | "muteChannel"
  | "createChannel"
  | "updateChannel"
  | "moveChannel"
  | "deleteChannel"
>;

export class Channels {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<ChannelsState>,
    private readonly backend: ChannelsBackendPart,
  ) {
    this.requests = new Requests("channels", port);
  }

  get(channelId: string): Channel | undefined {
    return this.port.get().byId[channelId];
  }

  /** Ids of the community's channels that are loaded. */
  idsOf(communityId: string): string[] {
    return Object.values(this.port.get().byId)
      .filter((channel) => channel.community_id === communityId)
      .map((channel) => channel.id);
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /** The community's channels, replacing whatever was held for it. */
  loadCommunity(communityId: string): Promise<void> {
    return this.requests.refresh(`community:${communityId}`, async (stale) => {
      const channels = await this.backend.listCommunityChannels(communityId);
      if (stale()) return;
      const kept = dropWhere(
        this.port.get().byId,
        (channel) => channel.community_id === communityId,
      );
      this.port.set({ byId: putRows(kept, channels) });
    });
  }

  /** The person's conversations and who is in each. */
  loadConversations(): Promise<void> {
    return this.requests.refresh("conversations", async (stale) => {
      const { channels, participants } = await this.backend.listConversations();
      if (stale()) return;
      const people: Record<string, string[]> = {};
      for (const row of participants) {
        (people[row.channel_id] ??= []).push(row.user_id);
      }
      const kept = dropWhere(
        this.port.get().byId,
        (channel) => channel.kind === "dm",
      );
      this.port.set({ byId: putRows(kept, channels), participants: people });
    });
  }

  /** Read marks, mutes and unread counts, for every channel at once. */
  loadMine(): Promise<void> {
    return this.requests.refresh("mine", async (stale) => {
      const [states, counts] = await Promise.all([
        this.backend.listMyChannelState(),
        this.backend.getUnreadCounts(),
      ]);
      if (stale()) return;
      const unread: Record<string, number> = {};
      for (const count of counts) unread[count.channel_id] = count.unread;
      const mine: Record<string, MyChannelState> = {};
      for (const { channel_id, last_read_message_id, muted_until } of states) {
        mine[channel_id] = { channel_id, last_read_message_id, muted_until };
      }
      this.port.set({ mine, unread });
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Everything up to `messageId` is read. The badge clears at once; the
   * database never moves a read mark back, so neither does this.
   */
  async markRead(channelId: string, messageId: string): Promise<void> {
    if (!isNewer(messageId, this.lastRead(channelId))) return;
    this.applyRead(channelId, messageId);
    await this.backend.markRead(channelId, messageId);
  }

  /** Null unmutes. */
  async mute(channelId: string, until: string | null): Promise<void> {
    await this.backend.muteChannel(channelId, until);
    this.writeMine(channelId, { muted_until: until });
  }

  // Managing a community's channels (`manage_channels`). Each answer is
  // shown at once; any other channel the database moved arrives as
  // `channel.updated`.

  async create(
    communityId: string,
    kind: Exclude<ChannelKind, "dm">,
    name: string,
    options?: { topic?: string; category_id?: string },
  ): Promise<Channel> {
    const channel = await this.backend.createChannel(
      communityId,
      kind,
      name,
      options,
    );
    this.applyChannel(channel);
    return channel;
  }

  async update(
    channelId: string,
    changes: { name?: string; topic?: string },
  ): Promise<void> {
    this.applyChannel(await this.backend.updateChannel(channelId, changes));
  }

  /** Null category puts it outside any category. */
  async move(
    channelId: string,
    categoryId: string | null,
    position: number,
  ): Promise<void> {
    this.applyChannel(
      await this.backend.moveChannel(channelId, categoryId, position),
    );
  }

  /** Use `HavenCore.deleteChannel`, which forgets it everywhere. */
  async remove(channelId: string): Promise<void> {
    await this.backend.deleteChannel(channelId);
    this.applyChannelDeleted(channelId);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  applyChannel(channel: Channel): void {
    this.port.set({ byId: putRows(this.port.get().byId, [channel]) });
    // A new conversation arrives without its people; they come with a reload.
    if (channel.kind === "dm" && !this.port.get().participants[channel.id]) {
      void this.loadConversations();
    }
  }

  applyChannelDeleted(channelId: string): void {
    this.forget([channelId]);
  }

  /** The community is gone, or the person is no longer in it. */
  applyCommunityGone(communityId: string): void {
    this.forget(this.idsOf(communityId));
    this.requests.forget(`community:${communityId}`);
  }

  /** The person read up to here on another device. */
  applyRead(channelId: string, messageId: string): void {
    if (!isNewer(messageId, this.lastRead(channelId))) return;
    this.writeMine(channelId, { last_read_message_id: messageId });
    const latest = this.get(channelId)?.latest_message_id ?? null;
    if (latest === null || !isNewer(latest, messageId)) {
      this.setUnread(channelId, 0);
    } else {
      // Read part of the way: only the database knows how many are left.
      void this.reloadUnread();
    }
  }

  /**
   * A new message moves the channel's newest id (the database sends no
   * channel event for that). The person's own message counts as read, as
   * it does in the database; anyone else's past the read mark is unread.
   */
  applyMessageCreated(message: MessageRecord, myId: string): void {
    const channel = this.get(message.channel_id);
    if (!channel) return;
    if (isNewer(message.id, channel.latest_message_id)) {
      this.port.set({
        byId: putRows(this.port.get().byId, [
          { ...channel, latest_message_id: message.id },
        ]),
      });
    }
    if (message.author_id === myId) {
      this.applyRead(message.channel_id, message.id);
    } else if (isNewer(message.id, this.lastRead(message.channel_id))) {
      const count = this.port.get().unread[message.channel_id] ?? 0;
      this.setUnread(message.channel_id, Math.min(count + 1, UNREAD_CAP));
    }
  }

  /** An unread message that is deleted is no longer unread. */
  applyMessageDeleted(messageId: string, channelId: string): void {
    const count = this.port.get().unread[channelId] ?? 0;
    if (count > 0 && isNewer(messageId, this.lastRead(channelId))) {
      this.setUnread(channelId, count - 1);
    }
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createChannelsState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private lastRead(channelId: string): string | null {
    return this.port.get().mine[channelId]?.last_read_message_id ?? null;
  }

  private reloadUnread(): Promise<void> {
    return this.requests.run("unread", async (stale) => {
      const counts = await this.backend.getUnreadCounts();
      if (stale()) return;
      const unread: Record<string, number> = {};
      for (const count of counts) unread[count.channel_id] = count.unread;
      this.port.set({ unread });
    });
  }

  private setUnread(channelId: string, count: number): void {
    const { [channelId]: _old, ...rest } = this.port.get().unread;
    this.port.set({
      unread: count > 0 ? { ...rest, [channelId]: count } : rest,
    });
  }

  private writeMine(
    channelId: string,
    change: Partial<Omit<MyChannelState, "channel_id">>,
  ): void {
    const { mine } = this.port.get();
    const current: MyChannelState = mine[channelId] ?? {
      channel_id: channelId,
      last_read_message_id: null,
      muted_until: null,
    };
    const next = { ...current, ...change };
    if (change.last_read_message_id !== undefined) {
      next.last_read_message_id = newest(
        current.last_read_message_id,
        change.last_read_message_id,
      );
    }
    this.port.set({ mine: { ...mine, [channelId]: next } });
  }

  private forget(channelIds: string[]): void {
    if (channelIds.length === 0) return;
    const state = this.port.get();
    const participants = { ...state.participants };
    const unread = { ...state.unread };
    for (const id of channelIds) {
      delete participants[id];
      delete unread[id];
    }
    this.port.set({
      byId: dropIds(state.byId, channelIds),
      mine: dropIds(state.mine, channelIds),
      participants,
      unread,
    });
  }
}
