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
  upsertMessageIntoChannelIndex,
  validateMediaSendOptions,
  type ChannelMeta,
  type SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";
import type {
  CommunityMessageBackend,
  CommunityReportBackend,
} from "@shared/lib/backend/communityDataBackend.interface";
import { MEDIA_ONLY_CONTENT_PLACEHOLDER } from "@shared/lib/backend/mediaAttachmentUtils";
import type {
  MessageBundle,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

/** The community data calls a channel's messages make: the message backend, plus reporting one. */
type MessageNexusBackend = CommunityMessageBackend &
  Pick<CommunityReportBackend, "reportMessage">;

export type CommunityMessageState = {
  entities: Record<string, NexusEntry<MessageBundle>>;
  byChannel: Record<string, string[]>;
  cursors: Record<string, string | null>;
  hasMore: Record<string, boolean>;
  initialLoadComplete: Record<string, boolean>;
  loadingInitial: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
  lastInitialLoadedAt: Record<string, number>;
};

/** Fresh objects every call: a store may morph its state in place, so never seed it with shared constants. */
export const createInitialCommunityMessageState =
  (): CommunityMessageState => ({
    entities: {},
    byChannel: {},
    cursors: {},
    hasMore: {},
    initialLoadComplete: {},
    loadingInitial: {},
    loadingOlder: {},
    lastInitialLoadedAt: {},
  });

type ChannelFlag = "loadingInitial" | "loadingOlder";

const cachedEntry = (message: MessageBundle): NexusEntry<MessageBundle> => ({
  data: message,
  partial: false,
  cachedAt: Date.now(),
});

/**
 * One community's messages: per-channel ordered windows over a shared entity
 * map, paged from the backend, persisted per community, patched by realtime.
 *
 * Write semantics (one meaning per name):
 *   - `insertMessage` adds a message only if it is not already cached. A
 *     realtime INSERT echo of our own optimistic send must not clobber the
 *     optimistic copy, which may hold data the echo lacks (a local media URL).
 *   - `upsertMessage` replaces the message and moves it to the slot its
 *     authoritative `createdAt` dictates.
 *   - `insertMessages` applies a fetched page; fetched data always wins.
 */
export class CommunityMessageNexus {
  private readonly gate = createLoadGate();
  private communityData: MessageNexusBackend | null = null;

  constructor(
    readonly communityId: string,
    protected readonly port: StatePort<CommunityMessageState>,
    private readonly persistence: NexusPersistence,
    readonly viewerMessagePolicyStore: ViewerMessagePolicyStore | null = null,
  ) {}

  private get storageKey(): string {
    return NEXUS_STORAGE_KEYS.communityMessages(this.communityId);
  }

  // ─── backend ───────────────────────────────────────────────────────────────

  setCommunityData(communityData: MessageNexusBackend): void {
    this.communityData = communityData;
  }

  isCommunityDataAttached(): boolean {
    return this.communityData !== null;
  }

  private requireBackend(method: string): MessageNexusBackend {
    if (!this.communityData) {
      throw new Error(
        `CommunityMessageNexus.${method} called before backend attached.`,
      );
    }
    return this.communityData;
  }

  // ─── reads ─────────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): MessageBundle | undefined {
    return this.port.get().entities[messageId]?.data;
  }

  getLastMessageId(channelId: string): string | null {
    const ids = this.port.get().byChannel[channelId] ?? [];
    return ids[ids.length - 1] ?? null;
  }

  getChannelAuthorIds(channelId: string): string[] {
    const { byChannel, entities } = this.port.get();
    const authors = new Set<string>();
    for (const id of byChannel[channelId] ?? []) {
      const author = entities[id]?.data.authorUserId;
      if (author) authors.add(author);
    }
    return Array.from(authors);
  }

  // ─── loading ───────────────────────────────────────────────────────────────

  async ensureInitialLoaded(
    channelId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const state = this.port.get();
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

  async loadInitial(channelId: string): Promise<void> {
    const communityData = this.requireBackend("loadInitial");
    return this.gate.run(`initial:${channelId}`, async (stale) => {
      this.setChannelFlag("loadingInitial", channelId, true);
      try {
        const result = await communityData.listChannelMessages({
          communityId: this.communityId,
          channelId,
          limit: MESSAGE_PAGE_SIZE,
          beforeCreatedAt: null,
          beforeMessageId: null,
        });
        if (stale()) return;
        const ascending = ascendingMessagesFromRpcPage(result.messages);
        this.insertMessages(ascending, channelId, {
          hasMore: result.hasMore,
          cursor: oldestMessageCursor(ascending),
        });
        const loaded = this.port.get();
        this.port.set({
          initialLoadComplete: {
            ...loaded.initialLoadComplete,
            [channelId]: true,
          },
          lastInitialLoadedAt: {
            ...loaded.lastInitialLoadedAt,
            [channelId]: Date.now(),
          },
        });
      } finally {
        this.setChannelFlag("loadingInitial", channelId, false);
      }
    });
  }

  async loadOlder(channelId: string): Promise<void> {
    const communityData = this.requireBackend("loadOlder");
    return this.gate.run(`older:${channelId}`, async (stale) => {
      const state = this.port.get();
      if (!(state.hasMore[channelId] ?? false)) return;
      const oldestId = state.byChannel[channelId]?.[0];
      const oldest = oldestId ? state.entities[oldestId]?.data : undefined;
      if (!oldest) return;
      const cursorBefore = state.cursors[channelId] ?? null;

      this.setChannelFlag("loadingOlder", channelId, true);
      try {
        const result = await communityData.listChannelMessages({
          communityId: this.communityId,
          channelId,
          limit: MESSAGE_PAGE_SIZE,
          beforeCreatedAt: oldest.createdAt,
          beforeMessageId: oldest.id,
        });
        if (stale()) return;
        const ascending = ascendingMessagesFromRpcPage(result.messages);
        this.insertMessages(
          ascending,
          channelId,
          mergePageIntoChannelMeta({
            hasMore: result.hasMore,
            cursor: oldestMessageCursor(ascending),
            preserveCursorOnEmpty: cursorBefore,
          }),
        );
      } finally {
        this.setChannelFlag("loadingOlder", channelId, false);
      }
    });
  }

  // ─── writes (local + realtime) ─────────────────────────────────────────────

  insertMessage(message: MessageBundle): void {
    const state = this.port.get();
    const existing = state.entities[message.id];
    const entities =
      existing && !existing.partial
        ? state.entities
        : { ...state.entities, [message.id]: cachedEntry(message) };
    this.port.set({
      entities,
      byChannel: {
        ...state.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => entities[id]?.data.createdAt,
        ),
      },
    });
    this.persist();
  }

  upsertMessage(message: MessageBundle): void {
    const state = this.port.get();
    const entities = { ...state.entities, [message.id]: cachedEntry(message) };
    this.port.set({
      entities,
      byChannel: {
        ...state.byChannel,
        // Reposition, not freeze: the server's createdAt must be able to move
        // an optimistically placed message to its true slot.
        [message.channelId]: upsertMessageIntoChannelIndex(
          state.byChannel[message.channelId] ?? [],
          message,
          (id) => entities[id]?.data.createdAt,
        ),
      },
    });
    this.persist();
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    meta: ChannelMeta,
  ): void {
    const state = this.port.get();
    const entities = { ...state.entities };
    let channelIndex = state.byChannel[channelId] ?? [];
    for (const message of messages) {
      entities[message.id] = cachedEntry(message);
      channelIndex = insertMessageIntoChannelIndex(
        channelIndex,
        message,
        (id) => entities[id]?.data.createdAt,
      );
    }
    this.port.set({
      entities,
      byChannel: { ...state.byChannel, [channelId]: channelIndex },
      cursors: { ...state.cursors, [channelId]: meta.cursor },
      hasMore: { ...state.hasMore, [channelId]: meta.hasMore },
    });
    this.persist();
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    const state = this.port.get();
    const entry = state.entities[messageId];
    if (!entry) return;
    this.port.set({
      entities: {
        ...state.entities,
        [messageId]: {
          ...entry,
          data: { ...entry.data, ...changes },
          cachedAt: Date.now(),
        },
      },
    });
    this.persist();
  }

  removeMessage(messageId: string, channelId: string): void {
    const state = this.port.get();
    const { [messageId]: _removed, ...entities } = state.entities;
    this.port.set({
      entities,
      byChannel: {
        ...state.byChannel,
        [channelId]: removeMessageIdFromChannelIndex(
          state.byChannel[channelId] ?? [],
          messageId,
        ),
      },
    });
    this.persist();
  }

  evictChannel(channelId: string): void {
    const state = this.port.get();
    const entities = { ...state.entities };
    for (const id of state.byChannel[channelId] ?? []) delete entities[id];
    this.port.set({
      entities,
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

  // ─── commands (backend round trips) ────────────────────────────────────────

  async send(
    channelId: string,
    content: string,
    options?: {
      replyToMessageId?: string | null;
      senderUserId?: string | null;
      senderIsPlatformStaff?: boolean;
    },
  ): Promise<{ id: string }> {
    const result = await this.requireBackend("send").sendUserMessage({
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
        createdAt: this.optimisticCreatedAt(channelId),
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
    const communityData = this.requireBackend("sendWithMedia");
    const { hasBlob, hasBuffer } = validateMediaSendOptions(options);
    const sender = {
      replyToMessageId: options?.replyToMessageId ?? null,
      senderUserId: options?.senderUserId ?? null,
      senderIsPlatformStaff: options?.senderIsPlatformStaff === true,
    };

    if (!hasBlob && !hasBuffer) {
      await this.send(channelId, content, sender);
      return;
    }

    const filename = inferMediaFilename(options);
    const fileBody = hasBuffer
      ? (options!.mediaArrayBuffer as ArrayBuffer)
      : (options!.mediaFile as Blob);
    const blobType =
      options?.mediaFile instanceof Blob ? options.mediaFile.type : "";

    const upload = await communityData.uploadMessageMedia({
      communityId: this.communityId,
      channelId,
      file: fileBody,
      filename,
      mimeType:
        options?.mediaContentType?.trim() ??
        (blobType || "application/octet-stream"),
      expiresInHours: coerceMediaExpiresInHours(options?.mediaExpiresInHours),
      contentType: options?.mediaContentType?.trim() ?? (blobType || undefined),
    });

    const messageContent =
      content.trim().length > 0 ? content : MEDIA_ONLY_CONTENT_PLACEHOLDER;
    const { id } = await this.send(channelId, messageContent, sender);

    try {
      await communityData.insertMessageAttachment({
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
    await this.requireBackend(
      "requestLinkPreviewBackfill",
    ).requestChannelLinkPreviewBackfill({
      communityId: this.communityId,
      channelId,
      messageIds,
    });
  }

  async edit(messageId: string, content: string): Promise<void> {
    await this.requireBackend("edit").editUserMessage({
      communityId: this.communityId,
      messageId,
      content,
    });
  }

  async deleteMessageRpc(messageId: string): Promise<void> {
    await this.requireBackend("deleteMessageRpc").deleteMessage({
      communityId: this.communityId,
      messageId,
    });
  }

  async toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.requireBackend("toggleReaction").toggleMessageReaction({
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
    await this.requireBackend("report").reportMessage({
      communityId: this.communityId,
      ...input,
    });
  }

  // ─── persistence + lifecycle ───────────────────────────────────────────────

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
        this.port.set({
          ...createInitialCommunityMessageState(),
          entities: snapshot.entities ?? {},
          byChannel: snapshot.channelState?.byChannel ?? {},
          cursors: snapshot.channelState?.cursors ?? {},
          hasMore: snapshot.channelState?.hasMore ?? {},
          initialLoadComplete: snapshot.channelState?.initialLoadComplete ?? {},
        });
      } else {
        // Legacy payload: a bare entity map.
        this.port.set({
          ...createInitialCommunityMessageState(),
          entities: parsed as Record<string, NexusEntry<MessageBundle>>,
        });
      }
    } catch (error) {
      console.warn("[CommunityMessageNexus] Failed to rehydrate", error);
      this.persistence.remove(this.storageKey);
    }
  }

  clear(): void {
    this.gate.clear();
    this.port.set(createInitialCommunityMessageState());
    this.persistence.remove(this.storageKey);
  }

  private persist(): void {
    try {
      const state = this.port.get();
      const snapshot = buildPersistedMessageSnapshot({
        byChannel: state.byChannel,
        cursors: state.cursors,
        hasMore: state.hasMore,
        initialLoadComplete: state.initialLoadComplete,
        entities: state.entities,
      });
      this.persistence.set(this.storageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("[CommunityMessageNexus] Failed to persist", error);
    }
  }

  private setChannelFlag(
    flag: ChannelFlag,
    channelId: string,
    value: boolean,
  ): void {
    const next = { ...this.port.get()[flag], [channelId]: value };
    // A computed key from a union widens to an index signature; the cast restores it.
    this.port.set({ [flag]: next } as Partial<CommunityMessageState>);
  }

  /**
   * Timestamp for an optimistic send, clamped to be no earlier than the newest
   * message already in the channel. A lagging local clock would otherwise stamp
   * the just-sent message in the past and sort it above older messages; the
   * server's createdAt reconciles the position shortly after via upsert.
   */
  private optimisticCreatedAt(channelId: string): string {
    const now = new Date().toISOString();
    const lastId = this.getLastMessageId(channelId);
    const lastCreatedAt = lastId
      ? this.port.get().entities[lastId]?.data.createdAt
      : undefined;
    if (!lastCreatedAt) return now;
    return Date.parse(lastCreatedAt) > Date.parse(now) ? lastCreatedAt : now;
  }
}
