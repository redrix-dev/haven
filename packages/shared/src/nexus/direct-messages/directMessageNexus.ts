import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from "@shared/lib/backend/types";
import { createLoadGate, isFresh } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";
import {
  directMessagePreview,
  isMessageCurrentOrNewerThanSummary,
  isSummaryNewerThanServerSummary,
  mergeNewerLocalLatestFields,
  sortConversationIds,
} from "./conversationOrdering";
import { projectConversations } from "./dmSelectors";
import type { DirectMessageState, DmComposeDraftPeer } from "./dmTypes";

const DM_PAGE_SIZE = 50;
const CONVERSATIONS_FRESHNESS_MS = 60_000;
const MESSAGES_FRESHNESS_MS = 10_000;

export const createInitialDirectMessageState = (): DirectMessageState => ({
  entities: {},
  conversationIds: [],
  messagesByConversation: {},
  messageEntities: {},
  hasMoreByConversation: {},
  activeConversationId: null,
  isLoadingConversations: false,
  conversationsLastLoadedAt: 0,
  loadingByConversation: {},
  messagesLoadComplete: {},
  messagesLastLoadedAt: {},
  composeDraftPeer: null,
});

export type SendDirectMessageOptions = {
  imageUpload?: Parameters<
    DirectMessageBackend["sendMessage"]
  >[0]["imageUpload"];
  metadata?: Record<string, unknown>;
  /** A local preview URL shown until the server's signed URL is available. */
  optimisticAttachmentUri?: string | null;
};

/** Only these survive a restart; message pages are always refetched. */
type PersistedDirectMessages = Pick<
  DirectMessageState,
  | "entities"
  | "conversationIds"
  | "conversationsLastLoadedAt"
  | "activeConversationId"
  | "composeDraftPeer"
>;

/**
 * Direct-message conversations (sorted by latest activity), their message
 * pages, the focused conversation and the compose draft for a not-yet-started
 * conversation. Realtime arrivals update a conversation's "latest" fields and
 * unread count without waiting for a reload.
 */
export class DirectMessageNexus {
  private readonly conversationLoads = createLoadGate();
  private readonly messageLoads = createLoadGate();

  constructor(
    protected readonly port: StatePort<DirectMessageState>,
    private readonly persistence: NexusPersistence,
    private readonly backend: DirectMessageBackend,
  ) {}

  // ─── reads ─────────────────────────────────────────────────────────────────

  getConversations(): DirectMessageConversationSummary[] {
    return projectConversations(this.port.get());
  }

  getConversation(
    conversationId: string,
  ): DirectMessageConversationSummary | undefined {
    return this.port.get().entities[conversationId]?.data;
  }

  getActiveConversationId(): string | null {
    return this.port.get().activeConversationId;
  }

  // ─── conversations ─────────────────────────────────────────────────────────

  loadConversations(options?: {
    suppressLoadingState?: boolean;
  }): Promise<void> {
    return this.conversationLoads.run("conversations", async (stale) => {
      const requestedAt = Date.now();
      const showLoading = !options?.suppressLoadingState;
      if (showLoading) this.port.set({ isLoadingConversations: true });
      try {
        const conversations = await this.backend.listConversations();
        if (stale()) return;
        this.setConversations(conversations, {
          preserveLocalUpdatedAfter: requestedAt,
        });
        this.port.set({ conversationsLastLoadedAt: Date.now() });
      } finally {
        if (showLoading) this.port.set({ isLoadingConversations: false });
      }
    });
  }

  ensureConversationsLoaded(options?: { freshnessMs?: number }): Promise<void> {
    if (this.conversationLoads.isRunning("conversations")) {
      return this.loadConversations();
    }
    const freshnessMs = options?.freshnessMs ?? CONVERSATIONS_FRESHNESS_MS;
    if (isFresh(this.port.get().conversationsLastLoadedAt, freshnessMs)) {
      return Promise.resolve();
    }
    return this.loadConversations();
  }

  /**
   * Replace the conversation list from the server. A local summary that already
   * knows a newer latest message keeps those fields; a conversation that just
   * got a local message after the request started is kept even if the server
   * reply predates it.
   */
  setConversations(
    conversations: DirectMessageConversationSummary[],
    options?: { preserveLocalUpdatedAfter?: number },
  ): void {
    const state = this.port.get();
    const entities: Record<
      string,
      NexusEntry<DirectMessageConversationSummary>
    > = {};
    const conversationIds: string[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    for (const conversation of conversations) {
      const existing = state.entities[conversation.conversationId];
      const data =
        existing?.data &&
        isSummaryNewerThanServerSummary(existing.data, conversation)
          ? mergeNewerLocalLatestFields(conversation, existing.data)
          : conversation;
      entities[conversation.conversationId] = {
        data,
        partial: false,
        cachedAt: now,
      };
      conversationIds.push(conversation.conversationId);
      seen.add(conversation.conversationId);
    }

    if (options?.preserveLocalUpdatedAfter != null) {
      for (const id of state.conversationIds) {
        const existing = state.entities[id];
        if (
          !seen.has(id) &&
          existing?.data.lastMessageId &&
          existing.cachedAt > options.preserveLocalUpdatedAfter
        ) {
          entities[id] = existing;
          conversationIds.push(id);
        }
      }
    }

    this.port.set({
      entities,
      conversationIds: sortConversationIds(conversationIds, entities),
      isLoadingConversations: false,
    });
    this.persist();
  }

  /** Apply a single conversation change from a realtime event. */
  updateConversation(
    conversationId: string,
    changes: Partial<DirectMessageConversationSummary>,
  ): void {
    const state = this.port.get();
    const entry = state.entities[conversationId];
    if (!entry) return;
    this.port.set({
      entities: {
        ...state.entities,
        [conversationId]: {
          ...entry,
          data: { ...entry.data, ...changes },
          cachedAt: Date.now(),
        },
      },
    });
    this.persist();
  }

  // ─── messages ──────────────────────────────────────────────────────────────

  loadMessages(conversationId: string): Promise<void> {
    return this.messageLoads.run(conversationId, async (stale) => {
      this.setLoadingForConversation(conversationId, true);
      try {
        const messages = await this.backend.listMessages({
          conversationId,
          limit: DM_PAGE_SIZE,
        });
        if (stale()) return;
        this.replaceMessages(conversationId, [...messages].reverse(), {
          hasMore: messages.length === DM_PAGE_SIZE,
        });
        const state = this.port.get();
        this.port.set({
          messagesLoadComplete: {
            ...state.messagesLoadComplete,
            [conversationId]: true,
          },
          messagesLastLoadedAt: {
            ...state.messagesLastLoadedAt,
            [conversationId]: Date.now(),
          },
        });
      } finally {
        this.setLoadingForConversation(conversationId, false);
      }
    });
  }

  /** Load a conversation's messages unless loaded within the window (default 10s; 0 forces). */
  async ensureMessagesLoaded(
    conversationId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const state = this.port.get();
    if (
      state.messagesLoadComplete[conversationId] &&
      isFresh(
        state.messagesLastLoadedAt[conversationId] ?? 0,
        options?.freshnessMs ?? MESSAGES_FRESHNESS_MS,
      )
    ) {
      return;
    }
    await this.loadMessages(conversationId);
  }

  async loadOlderMessages(conversationId: string): Promise<void> {
    const state = this.port.get();
    const ids = state.messagesByConversation[conversationId] ?? [];
    if (ids.length === 0) return;
    if (state.hasMoreByConversation[conversationId] === false) return;
    const oldest = state.messageEntities[ids[0]];
    if (!oldest) return;

    const messages = await this.backend.listMessages({
      conversationId,
      limit: DM_PAGE_SIZE,
      beforeCreatedAt: oldest.createdAt,
      beforeMessageId: oldest.messageId,
    });
    this.prependMessages(conversationId, [...messages].reverse(), {
      hasMore: messages.length === DM_PAGE_SIZE,
    });
  }

  replaceMessages(
    conversationId: string,
    messages: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    const state = this.port.get();
    const messageEntities = { ...state.messageEntities };
    const ids: string[] = [];
    for (const message of messages) {
      messageEntities[message.messageId] = message;
      ids.push(message.messageId);
    }
    this.port.set({
      messageEntities,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: ids,
      },
      hasMoreByConversation: {
        ...state.hasMoreByConversation,
        [conversationId]: options.hasMore,
      },
    });
  }

  prependMessages(
    conversationId: string,
    older: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    if (older.length === 0) return;
    const state = this.port.get();
    const messageEntities = { ...state.messageEntities };
    const olderIds: string[] = [];
    for (const message of older) {
      messageEntities[message.messageId] = message;
      olderIds.push(message.messageId);
    }
    this.port.set({
      messageEntities,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: [
          ...olderIds,
          ...(state.messagesByConversation[conversationId] ?? []),
        ],
      },
      hasMoreByConversation: {
        ...state.hasMoreByConversation,
        [conversationId]: options.hasMore,
      },
    });
  }

  /** Insert or replace a message, keeping the conversation sorted by createdAt whatever the arrival order. */
  upsertMessage(message: DirectMessage): void {
    const state = this.port.get();
    const messageEntities = {
      ...state.messageEntities,
      [message.messageId]: message,
    };
    const existing = state.messagesByConversation[message.conversationId] ?? [];
    if (existing.includes(message.messageId)) {
      this.port.set({ messageEntities });
      return;
    }
    const insertAt = existing.findIndex((id) => {
      const entry = state.messageEntities[id];
      return entry != null && entry.createdAt > message.createdAt;
    });
    const next = [...existing];
    if (insertAt === -1) next.push(message.messageId);
    else next.splice(insertAt, 0, message.messageId);
    this.port.set({
      messageEntities,
      messagesByConversation: {
        ...state.messagesByConversation,
        [message.conversationId]: next,
      },
    });
  }

  removeMessage(conversationId: string, messageId: string): void {
    const state = this.port.get();
    const { [messageId]: _removed, ...messageEntities } = state.messageEntities;
    this.port.set({
      messageEntities,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (
          state.messagesByConversation[conversationId] ?? []
        ).filter((id) => id !== messageId),
      },
    });
  }

  /** Realtime arrival with a known id: fetch it exactly and fold it in. */
  async receiveMessage(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const message = await this.backend.getMessage({
      conversationId,
      messageId,
    });
    if (message) await this.foldInReceived(message, "receiveMessage");
  }

  /** Realtime arrival from an older payload without an id: fetch the newest message. */
  async receiveLatest(conversationId: string): Promise<void> {
    const [message] = await this.backend.listMessages({
      conversationId,
      limit: 1,
    });
    if (message) await this.foldInReceived(message, "receiveLatest");
  }

  // ─── commands ──────────────────────────────────────────────────────────────

  /** Focus a conversation: load its messages fresh, mark it read, and list it if new. */
  async openConversation(
    conversationId: string,
    options?: { markRead?: boolean },
  ): Promise<void> {
    this.setComposeDraftPeer(null);
    this.setActiveConversationId(conversationId);
    await this.ensureMessagesLoaded(conversationId, { freshnessMs: 0 });
    if (options?.markRead !== false) {
      await this.markRead(conversationId);
    }
    if (!this.port.get().conversationIds.includes(conversationId)) {
      await this.loadConversations();
    }
  }

  async openWithUser(otherUserId: string): Promise<string> {
    const conversationId =
      await this.backend.getOrCreateDirectConversation(otherUserId);
    await this.openConversation(conversationId, { markRead: true });
    return conversationId;
  }

  /** Open the existing conversation with a user, or start a compose draft for one. */
  openDraftWithUser(targetUserId: string, displayName?: string | null): void {
    const existing = this.getConversations().find(
      (conversation) => conversation.otherUserId === targetUserId,
    );
    if (existing) {
      void this.openConversation(existing.conversationId, { markRead: true });
      return;
    }
    this.setComposeDraftPeer({
      userId: targetUserId,
      displayName: displayName?.trim() || "Direct",
    });
    this.setActiveConversationId(null);
  }

  getOrCreateDirectConversation(otherUserId: string): Promise<string> {
    return this.backend.getOrCreateDirectConversation(otherUserId);
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendDirectMessageOptions,
  ): Promise<DirectMessage> {
    const sent = await this.backend.sendMessage({
      conversationId,
      content,
      metadata: options?.metadata,
      imageUpload: options?.imageUpload,
    });
    const displayMessage =
      options?.optimisticAttachmentUri && sent.attachments.length > 0
        ? {
            ...sent,
            attachments: sent.attachments.map((attachment) => ({
              ...attachment,
              signedUrl:
                attachment.signedUrl ?? options.optimisticAttachmentUri ?? null,
            })),
          }
        : sent;

    this.upsertMessage(displayMessage);
    if (
      !this.applyLatestMessageToConversation(displayMessage, { unreadCount: 0 })
    ) {
      void this.refreshConversationsAfterMiss(
        "sendMessage",
        displayMessage.conversationId,
      );
    }
    return displayMessage;
  }

  async markRead(conversationId: string): Promise<boolean> {
    const ok = await this.backend.markConversationRead(conversationId);
    if (ok) this.updateConversation(conversationId, { unreadCount: 0 });
    return ok;
  }

  setMuted(conversationId: string, muted: boolean): Promise<boolean> {
    return this.backend.setConversationMuted({ conversationId, muted });
  }

  reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string> {
    return this.backend.reportMessage(input);
  }

  // ─── focus ─────────────────────────────────────────────────────────────────

  setActiveConversationId(id: string | null): void {
    this.port.set({ activeConversationId: id });
    this.persist();
  }

  setComposeDraftPeer(peer: DmComposeDraftPeer | null): void {
    this.port.set({ composeDraftPeer: peer });
    this.persist();
  }

  clearFocusedConversation(): void {
    this.setComposeDraftPeer(null);
    this.setActiveConversationId(null);
  }

  // ─── persistence + lifecycle ───────────────────────────────────────────────

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.directMessages);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedDirectMessages>;
      this.port.set({
        entities: parsed.entities ?? {},
        conversationIds: parsed.conversationIds ?? [],
        conversationsLastLoadedAt: parsed.conversationsLastLoadedAt ?? 0,
        activeConversationId: parsed.activeConversationId ?? null,
        composeDraftPeer: parsed.composeDraftPeer ?? null,
      });
    } catch (error) {
      console.warn("[DirectMessageNexus] Failed to rehydrate", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.directMessages);
    }
  }

  clear(): void {
    this.conversationLoads.clear();
    this.messageLoads.clear();
    this.port.set(createInitialDirectMessageState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.directMessages);
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async foldInReceived(
    message: DirectMessage,
    source: string,
  ): Promise<void> {
    this.upsertMessage(message);
    if (!this.applyLatestMessageToConversation(message)) {
      await this.refreshConversationsAfterMiss(source, message.conversationId);
    }
    this.markActiveIncomingRead(message);
  }

  /**
   * Make the message the conversation's latest when it is current or newer,
   * updating the preview and unread count. Returns whether the conversation
   * was known at all; an unknown one means the list must be reloaded.
   */
  private applyLatestMessageToConversation(
    message: DirectMessage,
    options?: { unreadCount?: number },
  ): boolean {
    const state = this.port.get();
    const entry = state.entities[message.conversationId];
    if (!entry) return false;
    const current = entry.data;
    if (!isMessageCurrentOrNewerThanSummary(message, current)) return true;

    const isDuplicateLatest = current.lastMessageId === message.messageId;
    const isIncomingDirect =
      current.kind === "direct" && current.otherUserId === message.authorUserId;
    const unreadCount =
      options?.unreadCount ??
      (isIncomingDirect
        ? state.activeConversationId === message.conversationId
          ? 0
          : isDuplicateLatest
            ? current.unreadCount
            : current.unreadCount + 1
        : current.kind === "direct"
          ? 0
          : current.unreadCount);

    const entities = {
      ...state.entities,
      [message.conversationId]: {
        ...entry,
        data: {
          ...current,
          updatedAt: message.createdAt,
          lastMessageAt: message.createdAt,
          lastMessageId: message.messageId,
          lastMessageAuthorUserId: message.authorUserId,
          lastMessagePreview: directMessagePreview(message),
          lastMessageCreatedAt: message.createdAt,
          unreadCount,
        },
        cachedAt: Date.now(),
      },
    };
    this.port.set({
      entities,
      conversationIds: sortConversationIds(state.conversationIds, entities),
    });
    this.persist();
    return true;
  }

  /** An incoming message in the conversation the viewer is looking at is read on arrival. */
  private markActiveIncomingRead(message: DirectMessage): void {
    const state = this.port.get();
    if (state.activeConversationId !== message.conversationId) return;
    const conversation = state.entities[message.conversationId]?.data;
    if (
      conversation?.kind !== "direct" ||
      conversation.otherUserId !== message.authorUserId
    ) {
      return;
    }
    void this.markRead(message.conversationId).catch((error) => {
      console.warn("[DirectMessageNexus] markRead after receive failed", error);
    });
  }

  private async refreshConversationsAfterMiss(
    source: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.loadConversations({ suppressLoadingState: true });
      if (!this.port.get().entities[conversationId]) {
        await this.loadConversations({ suppressLoadingState: true });
      }
    } catch (error) {
      console.warn(
        `[DirectMessageNexus] loadConversations after ${source} failed`,
        error,
      );
    }
  }

  private setLoadingForConversation(
    conversationId: string,
    loading: boolean,
  ): void {
    this.port.set({
      loadingByConversation: {
        ...this.port.get().loadingByConversation,
        [conversationId]: loading,
      },
    });
  }

  private persist(): void {
    try {
      const state = this.port.get();
      const persisted: PersistedDirectMessages = {
        entities: state.entities,
        conversationIds: state.conversationIds,
        conversationsLastLoadedAt: state.conversationsLastLoadedAt,
        activeConversationId: state.activeConversationId,
        composeDraftPeer: state.composeDraftPeer,
      };
      this.persistence.set(
        NEXUS_STORAGE_KEYS.directMessages,
        JSON.stringify(persisted),
      );
    } catch (error) {
      console.warn("[DirectMessageNexus] Failed to persist", error);
    }
  }
}
