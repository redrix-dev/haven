/**
 * Messages, for every channel: community channels and conversations are the
 * same thing here, because they are in the database. DATABASE.md: "Messages".
 *
 * Records are held by id exactly as the database sent them; a page and an
 * event carry the same `MessageRecord`, so either replaces the other. Each
 * channel that has been opened has a window: its loaded message ids, oldest
 * first, and whether the window reaches the oldest and the newest message.
 *
 * A message being sent is shown at once, as an outgoing message named by its
 * nonce. The stored message carries the nonce back, in the database's reply
 * or in its event, whichever comes first, and replaces the outgoing one.
 *
 * Nothing here is kept on the device. Messages can be deleted for real, by
 * their author or a moderator, and a copy on the device would keep them.
 */

import { HavenError } from "@shared/lib/backend/havenError";
import type { MessagesBackend, NewMessage } from "@shared/lib/backend/messages";
import type { MessageRecord } from "@shared/lib/backend/records";
import { createPortableUuid } from "@shared/lib/runtime/uuid";
import { asHavenError, Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** Messages per page. `list_messages` allows up to 100. */
export const PAGE_SIZE = 50;
/** Windows kept at once. Opening one more drops the one opened longest ago. */
export const MAX_WINDOWS = 20;

export type MessageWindow = {
  /** Oldest first. */
  readonly ids: readonly string[];
  /** Nothing older exists. */
  readonly atOldest: boolean;
  /** Nothing newer exists: new messages join the end as they arrive. */
  readonly atNewest: boolean;
};

/** What to send; the collection names the send. */
export type Draft = Omit<NewMessage, "nonce">;

/** A message the person sent that the database has not answered for yet. */
export type OutgoingMessage = Draft & {
  readonly nonce: string;
  readonly channel_id: string;
  /** Null while on its way; why it was refused, once it was. */
  readonly error: HavenError | null;
};

export type MessagesState = {
  byId: ById<MessageRecord>;
  /** By channel id. */
  windows: Readonly<Record<string, MessageWindow>>;
  /** Each channel's newest message id, for sidebars and conversation lists. */
  latest: Readonly<Record<string, string>>;
  /** By nonce, in the order they were sent. */
  outgoing: Readonly<Record<string, OutgoingMessage>>;
  requests: RequestMap;
};

export const createMessagesState = (): MessagesState => ({
  byId: {},
  windows: {},
  latest: {},
  outgoing: {},
  requests: {},
});

export type MessagesBackendPart = Pick<
  MessagesBackend,
  | "listMessages"
  | "getMessages"
  | "getLatestMessages"
  | "sendMessage"
  | "editMessage"
  | "deleteMessage"
  | "setReaction"
>;

/** Ids in time order: they are time-ordered UUIDs. */
const byTime = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const notOutgoing = () =>
  new HavenError(
    "not_found",
    "not_outgoing",
    "That message is no longer waiting to be sent.",
  );

const lastOf = (ids: readonly string[] | undefined): string | undefined =>
  ids?.[ids.length - 1];

export class Messages {
  readonly requests: Requests;
  /** Channel ids by when their window was last opened, oldest first. */
  private opened: string[] = [];
  /**
   * By nonce, one entry per send running: the stored message once it has
   * arrived by another way (its event, or a page).
   */
  private sending = new Map<string, MessageRecord | null>();

  constructor(
    private readonly port: StatePort<MessagesState>,
    private readonly backend: MessagesBackendPart,
    private readonly makeNonce: () => string = createPortableUuid,
  ) {
    this.requests = new Requests("messages", port);
  }

  get(messageId: string): MessageRecord | undefined {
    return this.port.get().byId[messageId];
  }

  window(channelId: string): MessageWindow | undefined {
    return this.port.get().windows[channelId];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /**
   * The channel is on screen. A window already held is current (events
   * keep it so), so only a channel without one loads its newest page.
   */
  open(channelId: string): Promise<void> {
    this.touch(channelId);
    if (this.window(channelId)) return Promise.resolve();
    return this.loadNewest(channelId);
  }

  /** Replaces the channel's window with its newest page. */
  loadNewest(channelId: string): Promise<void> {
    return this.requests.refresh(`channel:${channelId}`, async (stale) => {
      const page = await this.backend.listMessages(channelId, {
        limit: PAGE_SIZE,
      });
      if (stale()) return;
      this.settle(page);
      const ids = page.map((message) => message.id).sort(byTime);
      const inWindow = new Set(this.window(channelId)?.ids ?? []);
      // This page is the newest there is, so its last message is the
      // channel's newest, even if the one held before was deleted since.
      const { [channelId]: _old, ...latest } = this.port.get().latest;
      const newestId = lastOf(ids);
      this.port.set({
        byId: putRows(dropIds(this.port.get().byId, inWindow), page),
        windows: {
          ...this.port.get().windows,
          [channelId]: {
            ids,
            atOldest: page.length < PAGE_SIZE,
            atNewest: true,
          },
        },
        latest: newestId ? { ...latest, [channelId]: newestId } : latest,
      });
    });
  }

  /** The page before the window's oldest message (scrolling up). */
  loadOlder(channelId: string): Promise<void> {
    const window = this.window(channelId);
    const oldest = window?.ids[0];
    if (!window || window.atOldest || !oldest) return Promise.resolve();
    return this.requests.run(`older:${channelId}`, async (stale) => {
      const page = await this.backend.listMessages(channelId, {
        before_id: oldest,
        limit: PAGE_SIZE,
      });
      if (stale()) return;
      this.extend(channelId, page, "older");
    });
  }

  /** The page after the window's newest message, when it is not at the end. */
  loadNewer(channelId: string): Promise<void> {
    const window = this.window(channelId);
    const last = lastOf(window?.ids);
    if (!window || window.atNewest || !last) return Promise.resolve();
    return this.requests.run(`newer:${channelId}`, async (stale) => {
      const page = await this.backend.listMessages(channelId, {
        after_id: last,
        limit: PAGE_SIZE,
      });
      if (stale()) return;
      this.extend(channelId, page, "newer");
    });
  }

  /** The newest message of each channel, for a list that shows them. */
  loadLatest(channelIds: string[]): Promise<void> {
    const wanted = [...channelIds].sort();
    return this.requests.run(`latest:${wanted.join(",")}`, async (stale) => {
      const found = await this.backend.getLatestMessages(wanted);
      if (stale()) return;
      const latest = { ...this.port.get().latest };
      for (const id of wanted) delete latest[id];
      for (const message of found) latest[message.channel_id] = message.id;
      this.port.set({ byId: putRows(this.port.get().byId, found), latest });
    });
  }

  /** Particular messages, such as the ones being replied to. */
  ensure(messageIds: string[]): Promise<void> {
    const missing = messageIds.filter((id) => !this.get(id));
    if (missing.length === 0) return Promise.resolve();
    return this.requests.run(
      `ids:${missing.sort().join(",")}`,
      async (stale) => {
        const found = await this.backend.getMessages(missing);
        if (stale()) return;
        this.port.set({ byId: putRows(this.port.get().byId, found) });
      },
    );
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Shows the message at once as outgoing, then sends it. A refused send
   * stays, with its error, until it is retried or discarded.
   */
  send(channelId: string, draft: Draft): Promise<MessageRecord> {
    const nonce = this.makeNonce();
    this.putOutgoing({ ...draft, nonce, channel_id: channelId, error: null });
    return this.deliver(nonce);
  }

  /** Sends a refused message again, under the same nonce: sent once at most. */
  retry(nonce: string): Promise<MessageRecord> {
    const outgoing = this.port.get().outgoing[nonce];
    if (!outgoing) return Promise.reject(notOutgoing());
    this.putOutgoing({ ...outgoing, error: null });
    return this.deliver(nonce);
  }

  /** Lets go of a refused message the person no longer wants to send. */
  discard(nonce: string): void {
    this.port.set({ outgoing: dropIds(this.port.get().outgoing, [nonce]) });
  }

  async edit(messageId: string, body: string): Promise<void> {
    this.applyUpdated(await this.backend.editMessage(messageId, body));
  }

  async remove(messageId: string): Promise<void> {
    const message = this.get(messageId);
    await this.backend.deleteMessage(messageId);
    if (message) this.applyDeleted(messageId, message.channel_id);
  }

  /** The new reactions arrive as `message.updated`. */
  async react(messageId: string, emoji: string, on: boolean): Promise<void> {
    await this.backend.setReaction(messageId, emoji, on);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  applyCreated(message: MessageRecord): void {
    const { channel_id: channelId } = message;
    this.settle([message]);
    const window = this.window(channelId);
    // A window that reaches the newest message grows; one scrolled back in
    // history does not, and picks the message up when it pages forward.
    if (window?.atNewest) {
      const ids = window.ids.includes(message.id)
        ? window.ids
        : [...window.ids, message.id].sort(byTime);
      this.port.set({
        byId: putRows(this.port.get().byId, [message]),
        windows: {
          ...this.port.get().windows,
          [channelId]: { ...window, ids },
        },
      });
    }
    this.noteLatest(channelId, message.id, message);
  }

  /** Only replaces a message that is held: one nobody is looking at stays unloaded. */
  applyUpdated(message: MessageRecord): void {
    if (!this.get(message.id)) return;
    this.port.set({ byId: putRows(this.port.get().byId, [message]) });
  }

  applyDeleted(messageId: string, channelId: string): void {
    const state = this.port.get();
    const window = state.windows[channelId];
    const windows = window?.ids.includes(messageId)
      ? {
          ...state.windows,
          [channelId]: {
            ...window,
            ids: window.ids.filter((id) => id !== messageId),
          },
        }
      : state.windows;
    this.port.set({ byId: dropIds(state.byId, [messageId]), windows });
    if (state.latest[channelId] === messageId) {
      // The one before it is the window's last, when the window reaches the end.
      const before = window?.atNewest ? lastOf(windows[channelId]?.ids) : null;
      if (before) this.setLatest(channelId, before);
      else {
        this.dropLatest(channelId);
        void this.loadLatest([channelId]);
      }
    }
  }

  /**
   * Someone was banned from a community. People who may see hidden messages
   * see theirs marked hidden; everyone else stops seeing them at all.
   */
  applyBanned(communityId: string, userId: string, seesHidden: boolean): void {
    const fromThem = (message: MessageRecord) =>
      message.community_id === communityId && message.author_id === userId;
    if (seesHidden) {
      const hidden = Object.values(this.port.get().byId)
        .filter(fromThem)
        .map((message) => ({ ...message, hidden: true }));
      this.port.set({ byId: putRows(this.port.get().byId, hidden) });
      return;
    }
    const gone = Object.values(this.port.get().byId)
      .filter(fromThem)
      .map((message) => message.id);
    const goneSet = new Set(gone);
    const windows: Record<string, MessageWindow> = {};
    for (const [channelId, window] of Object.entries(this.port.get().windows)) {
      windows[channelId] = window.ids.some((id) => goneSet.has(id))
        ? { ...window, ids: window.ids.filter((id) => !goneSet.has(id)) }
        : window;
    }
    this.port.set({ byId: dropIds(this.port.get().byId, gone), windows });
    const lostLatest = Object.entries(this.port.get().latest)
      .filter(([, messageId]) => goneSet.has(messageId))
      .map(([channelId]) => channelId);
    if (lostLatest.length > 0) {
      for (const channelId of lostLatest) this.dropLatest(channelId);
      void this.loadLatest(lostLatest);
    }
  }

  /**
   * The channel can no longer be seen, or a window is no longer wanted:
   * its messages go, and a load still running for it writes nothing.
   */
  dropChannel(channelId: string): void {
    this.opened = this.opened.filter((id) => id !== channelId);
    this.closeWindow(channelId);
    this.dropLatest(channelId);
    const inChannel = (row: { channel_id: string }) =>
      row.channel_id === channelId;
    this.port.set({
      byId: dropWhere(this.port.get().byId, inChannel),
      outgoing: dropWhere(this.port.get().outgoing, inChannel),
    });
  }

  /** Channel ids that have a window, for reloading after a reconnect. */
  openChannelIds(): string[] {
    return Object.keys(this.port.get().windows);
  }

  clear(): void {
    this.opened = [];
    this.sending.clear();
    this.requests.clear();
    this.port.set(createMessagesState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private async deliver(nonce: string): Promise<MessageRecord> {
    const outgoing = this.port.get().outgoing[nonce];
    if (!outgoing) throw notOutgoing();
    const { channel_id: channelId, error: _error, ...message } = outgoing;
    this.sending.set(nonce, null);
    try {
      const stored = await this.backend.sendMessage(channelId, message);
      this.applyCreated(stored);
      return stored;
    } catch (error) {
      // Its event got here first, so the send went through whatever the
      // answer says (the connection dropped on the way back).
      const arrived = this.sending.get(nonce);
      if (arrived) return arrived;
      const refused = asHavenError(error);
      if (this.port.get().outgoing[nonce]) {
        this.putOutgoing({ ...outgoing, error: refused });
      }
      throw refused;
    } finally {
      this.sending.delete(nonce);
    }
  }

  private putOutgoing(outgoing: OutgoingMessage): void {
    this.port.set({
      outgoing: { ...this.port.get().outgoing, [outgoing.nonce]: outgoing },
    });
  }

  /** Outgoing messages whose stored message has arrived are done. */
  private settle(messages: readonly MessageRecord[]): void {
    const { outgoing } = this.port.get();
    const done: string[] = [];
    for (const message of messages) {
      if (!message.nonce || !outgoing[message.nonce]) continue;
      done.push(message.nonce);
      if (this.sending.has(message.nonce)) {
        this.sending.set(message.nonce, message);
      }
    }
    if (done.length > 0) this.port.set({ outgoing: dropIds(outgoing, done) });
  }

  private extend(
    channelId: string,
    page: MessageRecord[],
    side: "older" | "newer",
  ): void {
    const window = this.window(channelId);
    if (!window) return;
    this.settle(page);
    const ids = [
      ...new Set([...window.ids, ...page.map((message) => message.id)]),
    ].sort(byTime);
    const reachedEnd = page.length < PAGE_SIZE;
    this.port.set({
      byId: putRows(this.port.get().byId, page),
      windows: {
        ...this.port.get().windows,
        [channelId]: {
          ids,
          atOldest: side === "older" ? reachedEnd : window.atOldest,
          atNewest: side === "newer" ? reachedEnd : window.atNewest,
        },
      },
    });
    if (side === "newer" && reachedEnd) {
      this.noteLatest(channelId, lastOf(ids) ?? null);
    }
  }

  /** Records `messageId` as the channel's newest if it is newer than the one held. */
  private noteLatest(
    channelId: string,
    messageId: string | null,
    message?: MessageRecord,
  ): void {
    if (messageId === null) return;
    const current = this.port.get().latest[channelId];
    if (current !== undefined && current >= messageId) return;
    if (message && !this.get(messageId)) {
      this.port.set({ byId: putRows(this.port.get().byId, [message]) });
    }
    this.setLatest(channelId, messageId);
  }

  /**
   * Makes `messageId` the channel's newest, even if it is older than the
   * one held (that one was deleted). The one it replaces is let go unless a
   * window shows it.
   */
  private setLatest(channelId: string, messageId: string): void {
    const state = this.port.get();
    const replaced = state.latest[channelId];
    const shown = state.windows[channelId]?.ids.includes(replaced ?? "");
    this.port.set({
      byId:
        replaced && replaced !== messageId && !shown
          ? dropIds(state.byId, [replaced])
          : state.byId,
      latest: { ...state.latest, [channelId]: messageId },
    });
  }

  private dropLatest(channelId: string): void {
    const { [channelId]: _dropped, ...latest } = this.port.get().latest;
    this.port.set({ latest });
  }

  /** Marks a window as just opened, closing the oldest past MAX_WINDOWS. */
  private touch(channelId: string): void {
    this.opened = [...this.opened.filter((id) => id !== channelId), channelId];
    while (this.opened.length > MAX_WINDOWS) {
      const oldest = this.opened.shift();
      if (oldest) this.closeWindow(oldest);
    }
  }

  /**
   * Lets go of a window nobody has looked at in a while. Its newest message
   * stays: the sidebar still shows it. Reopening the channel loads again.
   */
  private closeWindow(channelId: string): void {
    for (const key of [
      `channel:${channelId}`,
      `older:${channelId}`,
      `newer:${channelId}`,
    ]) {
      this.requests.forget(key);
    }
    const { [channelId]: _window, ...windows } = this.port.get().windows;
    const keep = this.port.get().latest[channelId];
    this.port.set({
      byId: dropWhere(
        this.port.get().byId,
        (message) => message.channel_id === channelId && message.id !== keep,
      ),
      windows,
    });
  }
}
