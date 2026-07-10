import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import {
  MESSAGE_PAGE_SIZE,
  ascendingMessagesFromRpcPage,
  buildOptimisticSendBundle,
  buildPersistedMessageSnapshot,
  coerceMediaExpiresInHours,
  inferMediaFilename,
  insertMessageIntoChannelIndex,
  mergePageIntoChannelMeta,
  oldestMessageCursor,
  removeMessageIdFromChannelIndex,
  shouldSkipInitialReload,
  validateMediaSendOptions,
  type ChannelMeta,
  type SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  MessageBundle,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { MEDIA_ONLY_CONTENT_PLACEHOLDER } from "@shared/lib/backend/mediaAttachmentUtils";
import {
  projectVisibleChannelMessages,
  projectVisibleChannelMessagesBlockOnly,
} from "@shared/nexus/community/projectVisibleChannelMessages";

export type CommunityMessageSolidState = {
  entities: Record<string, NexusEntry<MessageBundle>>;
  byChannel: Record<string, string[]>;
  cursors: Record<string, string | null>;
  hasMore: Record<string, boolean>;
  initialLoadComplete: Record<string, boolean>;
  loadingInitial: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
  lastInitialLoadedAt: Record<string, number>;
};

const initialState = (): CommunityMessageSolidState => ({
  entities: {},
  byChannel: {},
  cursors: {},
  hasMore: {},
  initialLoadComplete: {},
  loadingInitial: {},
  loadingOlder: {},
  lastInitialLoadedAt: {},
});

/** Solid-native community message nexus — shared selectors + per-community persistence. */
export class CommunityMessageSolidNexus {
  readonly state: CommunityMessageSolidState;
  private readonly setState: SetStoreFunction<CommunityMessageSolidState>;
  private communityData: CommunityDataBackend | null = null;
  private initialLoadInflight = new Map<string, Promise<void>>();
  private olderLoadInflight = new Map<string, Promise<void>>();

  constructor(
    readonly communityId: string,
    private readonly persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  private get storageKey(): string {
    return NEXUS_STORAGE_KEYS.communityMessages(this.communityId);
  }

  // ─── reactive projections ──────────────────────────────────────────────────

  channelMessages(channelId: Accessor<string>): Accessor<MessageBundle[]> {
    return createMemo(() => {
      const ids = this.state.byChannel[channelId()] ?? [];
      const bundles: MessageBundle[] = [];
      for (const id of ids) {
        const entry = this.state.entities[id];
        if (entry) bundles.push(entry.data);
      }
      return bundles;
    });
  }

  visibleChannelMessages(
    channelId: Accessor<string>,
  ): Accessor<MessageBundle[]> {
    const raw = this.channelMessages(channelId);

    return createMemo(() => {
      // Read the policy proxy inside the memo so Solid tracks the exact fields.
      const policy = this.viewerMessagePolicyStore.getState();
      const communityPolicy = policy.communities[this.communityId];
      const rawMessages = raw();
      if (!communityPolicy) {
        return projectVisibleChannelMessagesBlockOnly(
          rawMessages,
          policy.hiddenAuthorIds,
        );
      }
      return projectVisibleChannelMessages(
        rawMessages,
        {
          hiddenAuthorIds: policy.hiddenAuthorIds,
          showHiddenMessages: policy.showHiddenMessages,
          communities: { [this.communityId]: communityPolicy },
        },
        { communityId: this.communityId, channelId: channelId() },
      );
    });
  }

  channelMeta(channelId: Accessor<string>): Accessor<ChannelMeta> {
    return createMemo(() => ({
      hasMore: this.state.hasMore[channelId()] ?? false,
      cursor: this.state.cursors[channelId()] ?? null,
    }));
  }

  isLoadingOlder(channelId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.state.loadingOlder[channelId()] ?? false);
  }

  hasInitialLoadCompleted(channelId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.initialLoadComplete[channelId()] ?? false,
    );
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  setCommunityData(communityData: CommunityDataBackend): void {
    this.communityData = communityData;
  }

  isCommunityDataAttached(): boolean {
    return this.communityData !== null;
  }

  getSnapshot(messageId: string): MessageBundle | undefined {
    return this.state.entities[messageId]?.data;
  }

  async ensureInitialLoaded(
    channelId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    if (
      shouldSkipInitialReload({
        initialLoadComplete: this.state.initialLoadComplete[channelId] ?? false,
        lastInitialLoadedAt: this.state.lastInitialLoadedAt[channelId] ?? 0,
        freshnessMs: options?.freshnessMs,
      })
    ) {
      return;
    }
    await this.loadInitial(channelId);
  }

  async loadInitial(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageSolidNexus.loadInitial called before backend attached.",
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

  async loadOlder(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageSolidNexus.loadOlder called before backend attached.",
      );
    }
    const inflight = this.olderLoadInflight.get(channelId);
    if (inflight) return inflight;

    const hasMore = this.state.hasMore[channelId] ?? false;
    if (!hasMore) return;

    const ids = this.state.byChannel[channelId] ?? [];
    const oldest = this.state.entities[ids[0]]?.data;
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
        preserveCursorOnEmpty: this.state.cursors[channelId] ?? null,
      });
      this.insertMessages(ascending, channelId, meta);
    })().finally(() => {
      this.olderLoadInflight.delete(channelId);
      this.setLoadingOlder(channelId, false);
    });

    this.olderLoadInflight.set(channelId, promise);
    return promise;
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
        const snapshot = parsed as ReturnType<
          typeof buildPersistedMessageSnapshot
        >;
        this.setState({
          ...initialState(),
          entities: snapshot.entities ?? {},
          byChannel: snapshot.channelState?.byChannel ?? {},
          cursors: snapshot.channelState?.cursors ?? {},
          hasMore: snapshot.channelState?.hasMore ?? {},
          initialLoadComplete: snapshot.channelState?.initialLoadComplete ?? {},
        });
      } else {
        this.setState({
          ...initialState(),
          entities: parsed as Record<string, NexusEntry<MessageBundle>>,
        });
      }
    } catch (error) {
      console.warn("[CommunityMessageSolidNexus] Failed to rehydrate", error);
      this.persistence.remove(this.storageKey);
    }
  }

  clear(): void {
    this.setState(initialState());
    this.persistence.remove(this.storageKey);
  }

  // ─── writes + realtime ─────────────────────────────────────────────────────

  insertMessage(message: MessageBundle): void {
    this.setState((state) => ({
      entities: {
        ...state.entities,
        [message.id]: { data: message, partial: false, cachedAt: Date.now() },
      },
      byChannel: {
        ...state.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => state.entities[id]?.data.createdAt,
        ),
      },
    }));
    this.persist();
  }

  upsertMessage(message: MessageBundle): void {
    this.setState((state) => ({
      entities: {
        ...state.entities,
        [message.id]: { data: message, partial: false, cachedAt: Date.now() },
      },
      byChannel: {
        ...state.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => state.entities[id]?.data.createdAt,
        ),
      },
    }));
    this.persist();
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    options: ChannelMeta,
  ): void {
    this.setState((state) => {
      const nextEntities = { ...state.entities };
      let nextByChannel = state.byChannel[channelId] ?? [];
      for (const message of messages) {
        nextEntities[message.id] = {
          data: message,
          partial: false,
          cachedAt: Date.now(),
        };
        nextByChannel = insertMessageIntoChannelIndex(
          nextByChannel,
          message,
          (id) => nextEntities[id]?.data.createdAt,
        );
      }
      return {
        entities: nextEntities,
        byChannel: { ...state.byChannel, [channelId]: nextByChannel },
        cursors: { ...state.cursors, [channelId]: options.cursor },
        hasMore: { ...state.hasMore, [channelId]: options.hasMore },
      };
    });
    this.persist();
  }

  removeMessage(messageId: string, channelId: string): void {
    this.setState((state) => {
      const { [messageId]: _, ...restEntities } = state.entities;
      return {
        entities: restEntities,
        byChannel: {
          ...state.byChannel,
          [channelId]: removeMessageIdFromChannelIndex(
            state.byChannel[channelId] ?? [],
            messageId,
          ),
        },
      };
    });
    this.persist();
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    this.setState((state) => {
      const entry = state.entities[messageId];
      if (!entry) return state;
      return {
        entities: {
          ...state.entities,
          [messageId]: { ...entry, data: { ...entry.data, ...changes } },
        },
      };
    });
    this.persist();
  }

  evictChannel(channelId: string): void {
    this.setState((state) => {
      const ids = state.byChannel[channelId] ?? [];
      const nextEntities = { ...state.entities };
      for (const id of ids) delete nextEntities[id];
      return {
        entities: nextEntities,
        byChannel: { ...state.byChannel, [channelId]: [] },
        cursors: { ...state.cursors, [channelId]: null },
        hasMore: { ...state.hasMore, [channelId]: false },
        initialLoadComplete: {
          ...state.initialLoadComplete,
          [channelId]: false,
        },
        loadingInitial: { ...state.loadingInitial, [channelId]: false },
        loadingOlder: { ...state.loadingOlder, [channelId]: false },
        lastInitialLoadedAt: { ...state.lastInitialLoadedAt, [channelId]: 0 },
      };
    });
    this.persist();
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
    if (!this.communityData) throw new Error("backend not attached");
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
    options?: {
      replyToMessageId?: string | null;
    } & SendCommunityMessageMediaOptions,
  ): Promise<void> {
    if (!this.communityData) throw new Error("backend not attached");

    const { hasBlob, hasBuffer } = validateMediaSendOptions(options);

    if (!hasBlob && !hasBuffer) {
      await this.send(channelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        senderUserId: options?.senderUserId ?? null,
        senderIsPlatformStaff: options?.senderIsPlatformStaff === true,
      });
      return;
    }

    const filename = inferMediaFilename(options);
    const fileBody = hasBuffer
      ? (options!.mediaArrayBuffer as ArrayBuffer)
      : (options!.mediaFile as Blob);

    const upload = await this.communityData.uploadMessageMedia({
      communityId: this.communityId,
      channelId,
      file: fileBody,
      filename,
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
        filename,
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
          originalFilename: filename,
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
    if (!this.communityData) throw new Error("backend not attached");
    await this.communityData.requestChannelLinkPreviewBackfill({
      communityId: this.communityId,
      channelId,
      messageIds,
    });
  }

  async edit(messageId: string, content: string): Promise<void> {
    if (!this.communityData) throw new Error("backend not attached");
    await this.communityData.editUserMessage({
      communityId: this.communityId,
      messageId,
      content,
    });
  }

  async deleteMessageRpc(messageId: string): Promise<void> {
    if (!this.communityData) throw new Error("backend not attached");
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
    if (!this.communityData) throw new Error("backend not attached");
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
    if (!this.communityData) throw new Error("backend not attached");
    await this.communityData.reportMessage({
      communityId: this.communityId,
      ...input,
    });
  }

  getLastMessageId(channelId: string): string | null {
    const ids = this.state.byChannel[channelId] ?? [];
    return ids[ids.length - 1] ?? null;
  }

  getChannelAuthorIds(channelId: string): string[] {
    const ids = this.state.byChannel[channelId] ?? [];
    const authors = new Set<string>();
    for (const id of ids) {
      const author = this.state.entities[id]?.data.authorUserId;
      if (author) authors.add(author);
    }
    return Array.from(authors);
  }

  private persist(): void {
    try {
      const state = this.state;
      const snapshot = buildPersistedMessageSnapshot({
        byChannel: state.byChannel,
        cursors: state.cursors,
        hasMore: state.hasMore,
        initialLoadComplete: state.initialLoadComplete,
        entities: state.entities,
      });
      this.persistence.set(this.storageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("[CommunityMessageSolidNexus] Failed to persist", error);
    }
  }

  private setLoadingInitial(channelId: string, loading: boolean): void {
    this.setState("loadingInitial", channelId, loading);
  }

  private setLoadingOlder(channelId: string, loading: boolean): void {
    this.setState("loadingOlder", channelId, loading);
  }

  private markInitialLoadComplete(channelId: string): void {
    this.setState("initialLoadComplete", channelId, true);
    this.setState("lastInitialLoadedAt", channelId, Date.now());
  }
}

export function createCommunityMessageSolidNexus(
  communityId: string,
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): CommunityMessageSolidNexus {
  return new CommunityMessageSolidNexus(
    communityId,
    persistence,
    viewerMessagePolicyStore,
  );
}
