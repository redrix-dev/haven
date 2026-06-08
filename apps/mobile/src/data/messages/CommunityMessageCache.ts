import { useMemo } from "react";
import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StoreApi } from "zustand";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type { CommunityMessageCacheInstance } from "@shared/core/cache/communityMessageCachePort";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import {
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
} from "@shared/core/viewerMessagePolicy";
import {
  MESSAGE_PAGE_SIZE,
  ascendingMessagesFromRpcPage,
  buildOptimisticSendBundle,
  buildPersistedMessageSnapshot,
  channelMetaEqual,
  coerceMediaExpiresInHours,
  inferMediaFilename,
  insertMessageIntoChannelIndex,
  mergePageIntoChannelMeta,
  messagesEqual,
  oldestMessageCursor,
  removeMessageIdFromChannelIndex,
  shouldSkipInitialReload,
  validateMediaSendOptions,
  type ChannelMeta,
  type SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";
import {
  projectVisibleChannelMessages,
  projectVisibleChannelMessagesBlockOnly,
} from "@shared/nexus/community/projectVisibleChannelMessages";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  MessageBundle,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { MEDIA_ONLY_CONTENT_PLACEHOLDER } from "@shared/lib/backend/mediaAttachmentUtils";

export type { ChannelMeta, SendCommunityMessageMediaOptions };

const EMPTY_MESSAGES: MessageBundle[] = [];
const DEFAULT_CHANNEL_META: ChannelMeta = { hasMore: false, cursor: null };

export type CommunityMessageStoreState = {
  entities: Record<string, NexusEntry<MessageBundle>>;
  byChannel: Record<string, string[]>;
  cursors: Record<string, string | null>;
  hasMore: Record<string, boolean>;
  initialLoadComplete: Record<string, boolean>;
  loadingInitial: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
  lastInitialLoadedAt: Record<string, number>;
};

const createInitialState = (): CommunityMessageStoreState => ({
  entities: {},
  byChannel: {},
  cursors: {},
  hasMore: {},
  initialLoadComplete: {},
  loadingInitial: {},
  loadingOlder: {},
  lastInitialLoadedAt: {},
});

export class CommunityMessageCache implements CommunityMessageCacheInstance {
  private readonly store: StoreApi<CommunityMessageStoreState>;
  private communityData: CommunityDataBackend | null = null;
  private initialLoadInflight = new Map<string, Promise<void>>();
  private olderLoadInflight = new Map<string, Promise<void>>();

  constructor(
    private readonly communityId: string,
    private readonly persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore | null = null,
  ) {
    this.store = create<CommunityMessageStoreState>(() => createInitialState());
  }

  private get storageKey(): string {
    return `haven:nexus:community-messages:${this.communityId}`;
  }

  getReactiveStore(): StoreApi<CommunityMessageStoreState> {
    return this.store;
  }

  getChannelMetaSelector(
    channelId: string,
  ): (state: CommunityMessageStoreState) => ChannelMeta {
    return (state) => ({
      hasMore: state.hasMore[channelId] ?? false,
      cursor: state.cursors[channelId] ?? null,
    });
  }

  getChannelStateSelector(
    channelId: string,
  ): (state: CommunityMessageStoreState) => MessageBundle[] {
    return (state) => {
      const ids = state.byChannel[channelId];
      if (!ids?.length) return EMPTY_MESSAGES;
      const messages: MessageBundle[] = [];
      for (const id of ids) {
        const entry = state.entities[id];
        if (entry && !entry.partial) messages.push(entry.data);
      }
      return messages;
    };
  }

  setCommunityData(communityData: CommunityDataBackend): void {
    this.communityData = communityData;
  }

  isCommunityDataAttached(): boolean {
    return this.communityData !== null;
  }

  private transform(raw: MessageBundle): MessageBundle {
    return raw;
  }

  private getSnapshot(id: string): MessageBundle | undefined {
    return this.store.getState().entities[id]?.data;
  }

  private getOrCreate(id: string, raw: MessageBundle): MessageBundle {
    const existing = this.store.getState().entities[id];
    if (existing && !existing.partial) return existing.data;
    const data = this.transform(raw);
    this.store.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [id]: { data, partial: false, cachedAt: Date.now() },
      },
    }));
    return data;
  }

  private update(id: string, changes: Partial<MessageBundle>): void {
    const existing = this.store.getState().entities[id];
    if (!existing) return;
    this.store.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [id]: {
          ...existing,
          data: { ...existing.data, ...changes },
          cachedAt: Date.now(),
        },
      },
    }));
  }

  private deleteEntity(id: string): void {
    this.store.setState((state) => {
      const { [id]: _, ...rest } = state.entities;
      return { ...state, entities: rest };
    });
  }

  async loadInitial(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.loadInitial called before backend attached.",
      );
    }
    const inflight = this.initialLoadInflight.get(channelId);
    if (inflight) return inflight;

    this.setLoadingInitial(channelId, true);
    const promise = (async () => {
      const result = await this.communityData!.listChannelMessages({
        communityId: this.communityId,
        channelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: null,
        beforeMessageId: null,
      });
      const ascending = ascendingMessagesFromRpcPage(result.messages);
      this.insertMessages(ascending, channelId, {
        hasMore: result.hasMore,
        cursor: oldestMessageCursor(ascending),
      });
      this.markInitialLoadComplete(channelId);
    })().finally(() => {
      this.initialLoadInflight.delete(channelId);
      this.setLoadingInitial(channelId, false);
    });

    this.initialLoadInflight.set(channelId, promise);
    return promise;
  }

  async ensureInitialLoaded(
    channelId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const state = this.store.getState();
    if (
      shouldSkipInitialReload({
        initialLoadComplete: state.initialLoadComplete[channelId] ?? false,
        lastInitialLoadedAt: state.lastInitialLoadedAt[channelId] ?? 0,
        freshnessMs: options?.freshnessMs,
      })
    ) {
      return;
    }
    await this.loadInitial(channelId);
  }

  async loadOlder(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.loadOlder called before backend attached.",
      );
    }
    const inflight = this.olderLoadInflight.get(channelId);
    if (inflight) return inflight;

    const state = this.store.getState();
    const hasMore = state.hasMore[channelId] ?? false;
    if (!hasMore) return;

    const ids = state.byChannel[channelId] ?? [];
    const oldestId = ids[0];
    const oldest = oldestId ? this.getSnapshot(oldestId) : undefined;
    if (!oldest) return;

    this.setLoadingOlder(channelId, true);
    const promise = (async () => {
      const result = await this.communityData!.listChannelMessages({
        communityId: this.communityId,
        channelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: oldest.createdAt,
        beforeMessageId: oldest.id,
      });
      const ascending = ascendingMessagesFromRpcPage(result.messages);
      const meta = mergePageIntoChannelMeta({
        hasMore: result.hasMore,
        cursor: oldestMessageCursor(ascending),
        preserveCursorOnEmpty: state.cursors[channelId] ?? null,
      });
      this.insertMessages(ascending, channelId, meta);
    })().finally(() => {
      this.olderLoadInflight.delete(channelId);
      this.setLoadingOlder(channelId, false);
    });

    this.olderLoadInflight.set(channelId, promise);
    return promise;
  }

  async send(
    channelId: string,
    content: string,
    options?: {
      replyToMessageId?: string | null;
      senderUserId?: string | null;
      senderIsPlatformStaff?: boolean;
    },
  ): Promise<{ id: string }> {
    if (!this.communityData) {
      throw new Error("CommunityMessageCache.send called before backend attached.");
    }
    const result = await this.communityData.sendUserMessage({
      communityId: this.communityId,
      channelId,
      content,
      replyToMessageId: options?.replyToMessageId ?? null,
    });
    this.insertMessage(
      buildOptimisticSendBundle({
        id: result.id,
        channelId,
        content,
        replyToMessageId: options?.replyToMessageId,
        senderUserId: options?.senderUserId,
        senderIsPlatformStaff: options?.senderIsPlatformStaff,
      }),
    );
    return result;
  }

  async sendWithMedia(
    channelId: string,
    content: string,
    options?: { replyToMessageId?: string | null } & SendCommunityMessageMediaOptions,
  ): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.sendWithMedia called before backend attached.",
      );
    }

    const { hasBlob, hasBuffer } = validateMediaSendOptions(options);

    if (!hasBlob && !hasBuffer) {
      await this.send(channelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        senderUserId: options?.senderUserId ?? null,
        senderIsPlatformStaff: options?.senderIsPlatformStaff === true,
      });
      return;
    }

    const inferredMediaFilename = inferMediaFilename(options);
    const fileBody = hasBuffer
      ? (options!.mediaArrayBuffer as ArrayBuffer)
      : (options!.mediaFile as Blob);

    const upload = await this.communityData.uploadMessageMedia({
      communityId: this.communityId,
      channelId,
      file: fileBody,
      filename: inferredMediaFilename,
      mimeType:
        options?.mediaContentType?.trim() ??
        (options?.mediaFile instanceof Blob
          ? options.mediaFile.type || "application/octet-stream"
          : "application/octet-stream"),
      expiresInHours: coerceMediaExpiresInHours(options?.mediaExpiresInHours),
      contentType:
        options?.mediaContentType?.trim() ??
        (options?.mediaFile instanceof Blob
          ? options.mediaFile.type || undefined
          : undefined),
    });

    const messageContent =
      content.trim().length > 0 ? content : MEDIA_ONLY_CONTENT_PLACEHOLDER;
    const { id } = await this.send(channelId, messageContent, {
      replyToMessageId: options?.replyToMessageId ?? null,
      senderUserId: options?.senderUserId ?? null,
      senderIsPlatformStaff: options?.senderIsPlatformStaff === true,
    });

    try {
      await this.communityData.insertMessageAttachment({
        messageId: id,
        communityId: this.communityId,
        channelId,
        objectPath: upload.objectPath,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        mediaKind: upload.mediaKind,
        filename: inferredMediaFilename,
        expiresAt: upload.expiresAt,
      });
      this.updateMessage(id, {
        attachment: {
          id: `optimistic:${id}`,
          messageId: id,
          communityId: this.communityId,
          channelId,
          ownerUserId: options?.senderUserId ?? "",
          bucketName: "message-media",
          objectPath: upload.objectPath,
          originalFilename: inferredMediaFilename,
          mimeType: upload.mimeType,
          mediaKind: upload.mediaKind,
          sizeBytes: upload.sizeBytes,
          createdAt: new Date().toISOString(),
          expiresAt: upload.expiresAt,
          signedUrl: options?.optimisticMediaUri ?? null,
        },
      });
    } catch (error) {
      this.removeMessage(id, channelId);
      await this.deleteMessageRpc(id);
      throw error;
    }
  }

  async requestLinkPreviewBackfill(
    channelId: string,
    messageIds: string[],
  ): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.requestLinkPreviewBackfill called before backend attached.",
      );
    }
    await this.communityData.requestChannelLinkPreviewBackfill({
      communityId: this.communityId,
      channelId,
      messageIds,
    });
  }

  async edit(messageId: string, content: string): Promise<void> {
    if (!this.communityData) {
      throw new Error("CommunityMessageCache.edit called before backend attached.");
    }
    await this.communityData.editUserMessage({
      communityId: this.communityId,
      messageId,
      content,
    });
  }

  async deleteMessageRpc(messageId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.deleteMessageRpc called before backend attached.",
      );
    }
    await this.communityData.deleteMessage({
      communityId: this.communityId,
      messageId,
    });
  }

  async toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageCache.toggleReaction called before backend attached.",
      );
    }
    await this.communityData.toggleMessageReaction({
      communityId: this.communityId,
      channelId,
      messageId,
      emoji,
    });
  }

  async report(input: {
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }): Promise<void> {
    if (!this.communityData) {
      throw new Error("CommunityMessageCache.report called before backend attached.");
    }
    await this.communityData.reportMessage({
      communityId: this.communityId,
      ...input,
    });
  }

  insertMessage(message: MessageBundle): void {
    this.getOrCreate(message.id, message);
    this.store.setState((state) => ({
      ...state,
      byChannel: {
        ...state.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => this.getSnapshot(id)?.createdAt,
        ),
      },
    }));
    this.persist();
  }

  upsertMessage(message: MessageBundle): void {
    this.store.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [message.id]: {
          data: this.transform(message),
          partial: false,
          cachedAt: Date.now(),
        },
      },
      byChannel: {
        ...state.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => this.getSnapshot(id)?.createdAt,
        ),
      },
    }));
    this.persist();
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    options: { hasMore: boolean; cursor: string | null },
  ): void {
    this.store.setState((state) => {
      const nextEntities = { ...state.entities };
      let nextByChannel = state.byChannel[channelId] ?? [];

      for (const message of messages) {
        nextEntities[message.id] = {
          data: this.transform(message),
          partial: false,
          cachedAt: Date.now(),
        };
        nextByChannel = insertMessageIntoChannelIndex(
          nextByChannel,
          message,
          (id) => nextEntities[id]?.data.createdAt ?? this.getSnapshot(id)?.createdAt,
        );
      }

      return {
        ...state,
        entities: nextEntities,
        byChannel: { ...state.byChannel, [channelId]: nextByChannel },
        cursors: { ...state.cursors, [channelId]: options.cursor },
        hasMore: { ...state.hasMore, [channelId]: options.hasMore },
      };
    });
    this.persist();
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    this.update(messageId, changes);
    this.persist();
  }

  removeMessage(messageId: string, channelId: string): void {
    this.store.setState((state) => ({
      ...state,
      byChannel: {
        ...state.byChannel,
        [channelId]: removeMessageIdFromChannelIndex(
          state.byChannel[channelId] ?? [],
          messageId,
        ),
      },
    }));
    this.deleteEntity(messageId);
    this.persist();
  }

  evictChannel(channelId: string): void {
    const state = this.store.getState();
    const ids = state.byChannel[channelId] ?? [];
    const nextEntities = { ...state.entities };
    for (const id of ids) {
      delete nextEntities[id];
    }

    this.store.setState({
      ...state,
      entities: nextEntities,
      byChannel: { ...state.byChannel, [channelId]: [] },
      cursors: { ...state.cursors, [channelId]: null },
      hasMore: { ...state.hasMore, [channelId]: false },
      initialLoadComplete: { ...state.initialLoadComplete, [channelId]: false },
      loadingInitial: { ...state.loadingInitial, [channelId]: false },
      loadingOlder: { ...state.loadingOlder, [channelId]: false },
      lastInitialLoadedAt: { ...state.lastInitialLoadedAt, [channelId]: 0 },
    });
    this.persist();
  }

  useChannel(channelId: string): MessageBundle[] {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        const ids = state.byChannel[channelId];
        if (!ids?.length) return EMPTY_MESSAGES;
        const messages: MessageBundle[] = [];
        for (const id of ids) {
          const entry = state.entities[id];
          if (entry && !entry.partial) messages.push(entry.data);
        }
        return messages;
      },
      messagesEqual,
    );
  }

  useVisibleChannel(channelId: string): MessageBundle[] {
    const raw = this.useChannel(channelId);
    const hiddenAuthorIds = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.hiddenAuthorIds,
          viewerPolicyHiddenAuthorIdsEqual,
        )
      : null;
    const showHiddenMessages = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.showHiddenMessages,
        )
      : false;
    const communityPolicy = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.communities[this.communityId],
          viewerCommunityPolicyEqual,
        )
      : undefined;

    return useMemo(() => {
      if (!this.viewerMessagePolicyStore) {
        return projectVisibleChannelMessagesBlockOnly(raw, new Set<string>());
      }
      const policy = {
        hiddenAuthorIds: hiddenAuthorIds ?? new Set<string>(),
        showHiddenMessages,
        communities: communityPolicy
          ? { [this.communityId]: communityPolicy }
          : {},
      };
      if (Object.keys(policy.communities).length === 0) {
        return projectVisibleChannelMessagesBlockOnly(raw, policy.hiddenAuthorIds);
      }
      return projectVisibleChannelMessages(raw, policy, {
        communityId: this.communityId,
        channelId,
      });
    }, [raw, hiddenAuthorIds, showHiddenMessages, communityPolicy, channelId]);
  }

  useChannelMeta(channelId: string): ChannelMeta {
    return useStoreWithEqualityFn(
      this.store,
      (state) => ({
        hasMore: state.hasMore[channelId] ?? false,
        cursor: state.cursors[channelId] ?? null,
      }),
      channelMetaEqual,
    );
  }

  useIsLoadingInitial(channelId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.loadingInitial[channelId] ?? false,
    );
  }

  useIsLoadingOlder(channelId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.loadingOlder[channelId] ?? false,
    );
  }

  useHasInitialLoadCompleted(channelId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.initialLoadComplete[channelId] ?? false,
    );
  }

  getLastMessageId(channelId: string): string | null {
    const ids = this.store.getState().byChannel[channelId] ?? [];
    return ids[ids.length - 1] ?? null;
  }

  getChannelAuthorIds(channelId: string): string[] {
    const ids = this.store.getState().byChannel[channelId] ?? [];
    const authors = new Set<string>();
    for (const id of ids) {
      const author = this.getSnapshot(id)?.authorUserId;
      if (author) authors.add(author);
    }
    return Array.from(authors);
  }

  clear(): void {
    this.store.setState(createInitialState());
    this.persistence.remove(this.storageKey);
  }

  persist(): void {
    try {
      const state = this.store.getState();
      const snapshot = buildPersistedMessageSnapshot({
        byChannel: state.byChannel,
        cursors: state.cursors,
        hasMore: state.hasMore,
        initialLoadComplete: state.initialLoadComplete,
        entities: state.entities,
      });
      this.persistence.set(this.storageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("[CommunityMessageCache] Failed to persist", error);
    }
  }

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(this.storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as
        | ReturnType<typeof buildPersistedMessageSnapshot>
        | Record<string, NexusEntry<MessageBundle>>;

      if (
        parsed &&
        typeof parsed === "object" &&
        "channelState" in parsed &&
        "entities" in parsed
      ) {
        const snapshot = parsed as ReturnType<typeof buildPersistedMessageSnapshot>;
        this.store.setState({
          ...createInitialState(),
          entities: snapshot.entities ?? {},
          byChannel: snapshot.channelState?.byChannel ?? {},
          cursors: snapshot.channelState?.cursors ?? {},
          hasMore: snapshot.channelState?.hasMore ?? {},
          initialLoadComplete: snapshot.channelState?.initialLoadComplete ?? {},
        });
      } else {
        this.store.setState({
          ...createInitialState(),
          entities: parsed as Record<string, NexusEntry<MessageBundle>>,
        });
      }
    } catch (error) {
      console.warn("[CommunityMessageCache] Failed to rehydrate", error);
      this.persistence.remove(this.storageKey);
    }
  }

  private setLoadingInitial(channelId: string, loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      loadingInitial: { ...state.loadingInitial, [channelId]: loading },
    }));
  }

  private setLoadingOlder(channelId: string, loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      loadingOlder: { ...state.loadingOlder, [channelId]: loading },
    }));
  }

  private markInitialLoadComplete(channelId: string): void {
    this.store.setState((state) => ({
      ...state,
      initialLoadComplete: { ...state.initialLoadComplete, [channelId]: true },
      lastInitialLoadedAt: {
        ...state.lastInitialLoadedAt,
        [channelId]: Date.now(),
      },
    }));
  }
}

/** @deprecated Use CommunityMessageCache — kept for transitional imports. */
export const CommunityMessageNexus = CommunityMessageCache;

export { messagesEqual, channelMetaEqual };
