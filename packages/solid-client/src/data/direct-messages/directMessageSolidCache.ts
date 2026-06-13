import { createStore } from "solid-js/store";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type {
  DmComposeDraftPeer,
  DirectMessageNexusState,
} from "@shared/nexus/direct-messages/dmTypes";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import { getDirectMessagePreviewText } from "@shared/lib/backend/directMessageUtils";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from "@shared/lib/backend/types";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

const DM_PAGE_SIZE = 50;
const DM_RELOAD_FRESHNESS_WINDOW_MS = 10_000;
const DM_PREVIEW_MAX_LENGTH = 180;

const initialState = (): DirectMessageNexusState => ({
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
  revision: 0,
});

const toEpochMs = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const conversationActivityAt = (
  conversation: DirectMessageConversationSummary,
): string | null =>
  conversation.lastMessageAt ??
  conversation.updatedAt ??
  conversation.createdAt;

const conversationLastMessageAt = (
  conversation: DirectMessageConversationSummary,
): string | null =>
  conversation.lastMessageCreatedAt ?? conversation.lastMessageAt;

const compareConversationSummariesDesc = (
  a: DirectMessageConversationSummary,
  b: DirectMessageConversationSummary,
): number => {
  const timeDelta =
    toEpochMs(conversationActivityAt(b)) - toEpochMs(conversationActivityAt(a));
  if (timeDelta !== 0) return timeDelta;
  return b.conversationId.localeCompare(a.conversationId);
};

const sortConversationIds = (
  ids: string[],
  entities: Record<string, NexusEntry<DirectMessageConversationSummary>>,
): string[] =>
  [...ids].sort((a, b) => {
    const first = entities[a]?.data;
    const second = entities[b]?.data;
    if (!first || !second) return 0;
    return compareConversationSummariesDesc(first, second);
  });

const isMessageCurrentOrNewerThanSummary = (
  message: DirectMessage,
  conversation: DirectMessageConversationSummary,
): boolean => {
  if (conversation.lastMessageId === message.messageId) return true;
  const currentAt = conversationLastMessageAt(conversation);
  if (!currentAt) return true;
  const messageTime = toEpochMs(message.createdAt);
  const currentTime = toEpochMs(currentAt);
  if (messageTime !== currentTime) return messageTime > currentTime;
  if (!conversation.lastMessageId) return true;
  return message.messageId > conversation.lastMessageId;
};

const isSummaryNewerThanServerSummary = (
  local: DirectMessageConversationSummary,
  server: DirectMessageConversationSummary,
): boolean => {
  const localTime = toEpochMs(conversationLastMessageAt(local));
  const serverTime = toEpochMs(conversationLastMessageAt(server));
  if (localTime !== serverTime) return localTime > serverTime;
  if (!local.lastMessageId || !server.lastMessageId) {
    return Boolean(local.lastMessageId && !server.lastMessageId);
  }
  return local.lastMessageId > server.lastMessageId;
};

const mergeNewerLocalLatestFields = (
  server: DirectMessageConversationSummary,
  local: DirectMessageConversationSummary,
): DirectMessageConversationSummary => ({
  ...server,
  updatedAt: local.updatedAt,
  lastMessageAt: local.lastMessageAt,
  lastMessageId: local.lastMessageId,
  lastMessageAuthorUserId: local.lastMessageAuthorUserId,
  lastMessagePreview: local.lastMessagePreview,
  lastMessageCreatedAt: local.lastMessageCreatedAt,
  unreadCount: local.unreadCount,
});

const directMessagePreview = (message: DirectMessage): string | null => {
  const preview = getDirectMessagePreviewText(
    message.content,
    message.attachments.length,
  );
  if (!preview) return null;
  return preview.length > DM_PREVIEW_MAX_LENGTH
    ? `${preview.slice(0, DM_PREVIEW_MAX_LENGTH)}...`
    : preview;
};

type SendDirectMessageOptions = {
  imageUpload?: Parameters<
    DirectMessageBackend["sendMessage"]
  >[0]["imageUpload"];
  metadata?: Record<string, unknown>;
  optimisticAttachmentUri?: string | null;
};

/** Solid-native DM cache — calls shared selectors, no zustand. */
export class DirectMessageSolidCache {
  readonly state: DirectMessageNexusState;
  readonly reactiveStore: NotifyingReadableStore<DirectMessageNexusState>;

  private readonly setState: (
    updater: (
      state: DirectMessageNexusState,
    ) => Partial<DirectMessageNexusState>,
  ) => void;
  private conversationsInflight: Promise<void> | null = null;
  private messagesInflight = new Map<string, Promise<void>>();

  constructor(private readonly backend: DirectMessageBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  async loadConversations(options?: {
    suppressLoadingState?: boolean;
  }): Promise<void> {
    if (this.conversationsInflight) return this.conversationsInflight;

    this.conversationsInflight = (async () => {
      const requestedAt = Date.now();
      if (!options?.suppressLoadingState) {
        this.setIsLoadingConversations(true);
      }
      try {
        const conversations = await this.backend.listConversations();
        this.setConversations(conversations, {
          preserveLocalUpdatedAfter: requestedAt,
        });
        this.setConversationsLastLoadedAt(Date.now());
      } finally {
        if (!options?.suppressLoadingState) {
          this.setIsLoadingConversations(false);
        }
      }
    })().finally(() => {
      this.conversationsInflight = null;
    });

    return this.conversationsInflight;
  }

  async ensureConversationsLoaded(options?: {
    freshnessMs?: number;
  }): Promise<void> {
    if (this.conversationsInflight) return this.conversationsInflight;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    if (
      this.state.conversationsLastLoadedAt > 0 &&
      Date.now() - this.state.conversationsLastLoadedAt < freshnessMs
    ) {
      return;
    }
    await this.loadConversations();
  }

  async loadMessages(conversationId: string): Promise<void> {
    const inflight = this.messagesInflight.get(conversationId);
    if (inflight) return inflight;

    const promise = (async () => {
      this.setLoadingForConversation(conversationId, true);
      try {
        const messages = await this.backend.listMessages({
          conversationId,
          limit: DM_PAGE_SIZE,
        });
        this.replaceMessages(conversationId, [...messages].reverse(), {
          hasMore: messages.length === DM_PAGE_SIZE,
        });
        this.markMessagesLoadComplete(conversationId);
      } finally {
        this.setLoadingForConversation(conversationId, false);
      }
    })().finally(() => {
      this.messagesInflight.delete(conversationId);
    });

    this.messagesInflight.set(conversationId, promise);
    return promise;
  }

  async ensureMessagesLoaded(
    conversationId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const freshnessMs = options?.freshnessMs ?? DM_RELOAD_FRESHNESS_WINDOW_MS;
    const lastAt = this.state.messagesLastLoadedAt[conversationId] ?? 0;
    if (
      this.state.messagesLoadComplete[conversationId] &&
      Date.now() - lastAt < freshnessMs
    ) {
      return;
    }
    await this.loadMessages(conversationId);
  }

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
    if (!this.state.conversationIds.includes(conversationId)) {
      await this.loadConversations();
    }
  }

  async openWithUser(otherUserId: string): Promise<string> {
    const conversationId =
      await this.backend.getOrCreateDirectConversation(otherUserId);
    await this.openConversation(conversationId, { markRead: true });
    return conversationId;
  }

  openDraftWithUser(targetUserId: string, displayName?: string | null): void {
    const existing = this.state.conversationIds
      .map((id) => this.state.entities[id]?.data)
      .find((conversation) => conversation?.otherUserId === targetUserId);
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

  async loadOlderMessages(conversationId: string): Promise<void> {
    const ids = this.state.messagesByConversation[conversationId] ?? [];
    if (ids.length === 0) return;
    if (this.state.hasMoreByConversation[conversationId] === false) return;
    const oldest = this.state.messageEntities[ids[0]];
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

  async getOrCreateDirectConversation(otherUserId: string): Promise<string> {
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
      void this.refreshConversationsAfterMessageMiss(
        "sendMessage",
        displayMessage.conversationId,
      );
    }
    return displayMessage;
  }

  async markRead(conversationId: string): Promise<boolean> {
    const ok = await this.backend.markConversationRead(conversationId);
    if (!ok) return false;

    this.setState((state) => {
      const entry = state.entities[conversationId];
      if (!entry) return { revision: state.revision };
      return {
        entities: {
          ...state.entities,
          [conversationId]: {
            ...entry,
            data: { ...entry.data, unreadCount: 0 },
            cachedAt: Date.now(),
          },
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
    return true;
  }

  async setMuted(conversationId: string, muted: boolean): Promise<boolean> {
    return this.backend.setConversationMuted({ conversationId, muted });
  }

  setConversations(
    conversations: DirectMessageConversationSummary[],
    options?: { preserveLocalUpdatedAfter?: number },
  ): void {
    this.setState((state) => {
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

      return {
        entities,
        conversationIds: sortConversationIds(conversationIds, entities),
        isLoadingConversations: false,
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  replaceMessages(
    conversationId: string,
    messages: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    this.setState((state) => {
      const messageEntities = { ...state.messageEntities };
      const ids: string[] = [];
      for (const message of messages) {
        messageEntities[message.messageId] = message;
        ids.push(message.messageId);
      }
      return {
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: ids,
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: options.hasMore,
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  prependMessages(
    conversationId: string,
    older: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    if (older.length === 0) return;
    this.setState((state) => {
      const messageEntities = { ...state.messageEntities };
      const existing = state.messagesByConversation[conversationId] ?? [];
      const olderIds: string[] = [];
      for (const message of older) {
        messageEntities[message.messageId] = message;
        olderIds.push(message.messageId);
      }
      return {
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...olderIds, ...existing],
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: options.hasMore,
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  upsertMessage(message: DirectMessage): void {
    this.setState((state) => {
      const messageEntities = {
        ...state.messageEntities,
        [message.messageId]: message,
      };
      const existing =
        state.messagesByConversation[message.conversationId] ?? [];
      if (existing.includes(message.messageId)) {
        return { messageEntities, revision: state.revision + 1 };
      }

      const insertAt = existing.findIndex((id) => {
        const entry = state.messageEntities[id];
        return entry != null && entry.createdAt > message.createdAt;
      });
      const next = [...existing];
      if (insertAt === -1) {
        next.push(message.messageId);
      } else {
        next.splice(insertAt, 0, message.messageId);
      }
      return {
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [message.conversationId]: next,
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  async receiveLatest(conversationId: string): Promise<void> {
    const messages = await this.backend.listMessages({
      conversationId,
      limit: 1,
    });
    const [message] = messages;
    if (!message) return;
    this.upsertMessage(message);
    if (!this.applyLatestMessageToConversation(message)) {
      await this.refreshConversationsAfterMessageMiss(
        "receiveLatest",
        message.conversationId,
      );
    }
    this.markActiveReceivedMessageRead(message);
  }

  async receiveMessage(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const message = await this.backend.getMessage({
      conversationId,
      messageId,
    });
    if (!message) return;
    this.upsertMessage(message);
    if (!this.applyLatestMessageToConversation(message)) {
      await this.refreshConversationsAfterMessageMiss(
        "receiveMessage",
        message.conversationId,
      );
    }
    this.markActiveReceivedMessageRead(message);
  }

  removeMessage(conversationId: string, messageId: string): void {
    this.setState((state) => {
      const { [messageId]: _removed, ...rest } = state.messageEntities;
      const existing = state.messagesByConversation[conversationId] ?? [];
      return {
        messageEntities: rest,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: existing.filter((id) => id !== messageId),
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  setActiveConversationId(id: string | null): void {
    this.setState((state) => ({
      activeConversationId: id,
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  setComposeDraftPeer(peer: DmComposeDraftPeer | null): void {
    this.setState((state) => ({
      composeDraftPeer: peer,
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  clearFocusedConversation(): void {
    this.setComposeDraftPeer(null);
    this.setActiveConversationId(null);
  }

  setIsLoadingConversations(loading: boolean): void {
    this.setState((state) => ({
      isLoadingConversations: loading,
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  setConversationsLastLoadedAt(loadedAt: number): void {
    this.setState((state) => ({
      conversationsLastLoadedAt: loadedAt,
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  setLoadingForConversation(conversationId: string, loading: boolean): void {
    this.setState((state) => ({
      loadingByConversation: {
        ...state.loadingByConversation,
        [conversationId]: loading,
      },
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  updateConversation(
    conversationId: string,
    changes: Partial<DirectMessageConversationSummary>,
  ): void {
    this.setState((state) => {
      const entry = state.entities[conversationId];
      if (!entry) return { revision: state.revision };
      return {
        entities: {
          ...state.entities,
          [conversationId]: {
            ...entry,
            data: { ...entry.data, ...changes },
            cachedAt: Date.now(),
          },
        },
        revision: state.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  rehydrate(): void {}

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }

  async reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string> {
    return this.backend.reportMessage(input);
  }

  private applyLatestMessageToConversation(
    message: DirectMessage,
    options?: { unreadCount?: number },
  ): boolean {
    let hadConversation = false;
    let changed = false;
    this.setState((state) => {
      const entry = state.entities[message.conversationId];
      if (!entry) return { revision: state.revision };

      hadConversation = true;
      const current = entry.data;
      if (!isMessageCurrentOrNewerThanSummary(message, current)) {
        return { revision: state.revision };
      }

      const isDuplicateLatest = current.lastMessageId === message.messageId;
      const isIncomingDirectMessage =
        current.kind === "direct" &&
        current.otherUserId === message.authorUserId;
      const unreadCount =
        options?.unreadCount ??
        (isIncomingDirectMessage
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

      changed = true;
      return {
        entities,
        conversationIds: sortConversationIds(state.conversationIds, entities),
        revision: state.revision + 1,
      };
    });
    if (changed) this.reactiveStore.notify();
    return hadConversation;
  }

  private markActiveReceivedMessageRead(message: DirectMessage): void {
    if (this.state.activeConversationId !== message.conversationId) return;
    const conversation = this.state.entities[message.conversationId]?.data;
    if (
      conversation?.kind !== "direct" ||
      conversation.otherUserId !== message.authorUserId
    ) {
      return;
    }
    void this.markRead(message.conversationId).catch((error) => {
      console.warn(
        "[DirectMessageSolidCache] markRead after receive failed",
        error,
      );
    });
  }

  private async refreshConversationsAfterMessageMiss(
    source: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.loadConversations({ suppressLoadingState: true });
      if (!this.state.entities[conversationId]) {
        await this.loadConversations({ suppressLoadingState: true });
      }
    } catch (error) {
      console.warn(
        `[DirectMessageSolidCache] loadConversations after ${source} failed`,
        error,
      );
    }
  }

  private markMessagesLoadComplete(conversationId: string): void {
    this.setState((state) => ({
      messagesLoadComplete: {
        ...state.messagesLoadComplete,
        [conversationId]: true,
      },
      messagesLastLoadedAt: {
        ...state.messagesLastLoadedAt,
        [conversationId]: Date.now(),
      },
      revision: state.revision + 1,
    }));
    this.reactiveStore.notify();
  }
}

export function createDirectMessageSolidCache(
  backend: DirectMessageBackend,
): DirectMessageSolidCache {
  return new DirectMessageSolidCache(backend);
}
