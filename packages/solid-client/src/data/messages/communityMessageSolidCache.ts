import { createStore } from "solid-js/store";
import type { MessageBundle } from "@shared/lib/backend/types";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";
import {
  MESSAGE_PAGE_SIZE,
  ascendingMessagesFromRpcPage,
  buildOptimisticSendBundle,
  coerceMediaExpiresInHours,
  inferMediaFilename,
  insertMessageIntoChannelIndex,
  oldestMessageCursor,
  removeMessageIdFromChannelIndex,
  shouldSkipInitialReload,
  validateMediaSendOptions,
  type ChannelMeta,
  type SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";
import { MEDIA_ONLY_CONTENT_PLACEHOLDER } from "@shared/lib/backend/mediaAttachmentUtils";

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

/** Solid-native community message cache — calls shared pure logic, no zustand adapter. */
export class CommunityMessageSolidCache {
  readonly state: CommunityMessageSolidState;
  readonly reactiveStore: NotifyingReadableStore<CommunityMessageSolidState>;
  private readonly setState: (
    updater: (
      state: CommunityMessageSolidState,
    ) => Partial<CommunityMessageSolidState> | CommunityMessageSolidState,
  ) => void;
  private communityData: CommunityDataBackend | null = null;

  constructor(readonly communityId: string) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  private bump(): void {
    this.reactiveStore.notify();
  }

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
        "CommunityMessageSolidCache.loadInitial called before backend attached.",
      );
    }
    if (this.state.loadingInitial[channelId]) return;
    this.setLoadingFlag("loadingInitial", channelId, true);
    try {
      const result = await this.communityData.listChannelMessages({
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
      this.setState((s) => ({
        initialLoadComplete: { ...s.initialLoadComplete, [channelId]: true },
        lastInitialLoadedAt: {
          ...s.lastInitialLoadedAt,
          [channelId]: Date.now(),
        },
      }));
      this.bump();
    } finally {
      this.setLoadingFlag("loadingInitial", channelId, false);
    }
  }

  async loadOlder(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageSolidCache.loadOlder called before backend attached.",
      );
    }
    const hasMore = this.state.hasMore[channelId] ?? false;
    if (!hasMore) return;
    if (this.state.loadingOlder[channelId]) return;
    const ids = this.state.byChannel[channelId] ?? [];
    const oldest = this.state.entities[ids[0]]?.data;
    if (!oldest) return;

    this.setLoadingFlag("loadingOlder", channelId, true);
    try {
      const result = await this.communityData.listChannelMessages({
        communityId: this.communityId,
        channelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: oldest.createdAt,
        beforeMessageId: oldest.id,
      });
      const ascending = ascendingMessagesFromRpcPage(result.messages);
      this.insertMessages(ascending, channelId, {
        hasMore: result.hasMore,
        cursor: oldestMessageCursor(ascending),
      });
    } finally {
      this.setLoadingFlag("loadingOlder", channelId, false);
    }
  }

  private setLoadingFlag(
    flag: "loadingInitial" | "loadingOlder",
    channelId: string,
    value: boolean,
  ): void {
    this.setState((s) => ({
      [flag]: { ...s[flag], [channelId]: value },
    }));
    this.bump();
  }

  insertMessage(message: MessageBundle): void {
    this.setState((s) => ({
      entities: {
        ...s.entities,
        [message.id]: { data: message, partial: false, cachedAt: Date.now() },
      },
      byChannel: {
        ...s.byChannel,
        [message.channelId]: insertMessageIntoChannelIndex(
          s.byChannel[message.channelId] ?? [],
          message,
          (id) => s.entities[id]?.data.createdAt,
        ),
      },
    }));
    this.bump();
  }

  upsertMessage(message: MessageBundle): void {
    this.insertMessage(message);
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    options: ChannelMeta,
  ): void {
    this.setState((s) => {
      const nextEntities = { ...s.entities };
      let nextByChannel = s.byChannel[channelId] ?? [];
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
        byChannel: { ...s.byChannel, [channelId]: nextByChannel },
        cursors: { ...s.cursors, [channelId]: options.cursor },
        hasMore: { ...s.hasMore, [channelId]: options.hasMore },
      };
    });
    this.bump();
  }

  removeMessage(messageId: string, channelId: string): void {
    this.setState((s) => {
      const { [messageId]: _, ...restEntities } = s.entities;
      return {
        entities: restEntities,
        byChannel: {
          ...s.byChannel,
          [channelId]: removeMessageIdFromChannelIndex(
            s.byChannel[channelId] ?? [],
            messageId,
          ),
        },
      };
    });
    this.bump();
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    this.setState((s) => {
      const entry = s.entities[messageId];
      if (!entry) return s;
      return {
        entities: {
          ...s.entities,
          [messageId]: { ...entry, data: { ...entry.data, ...changes } },
        },
      };
    });
    this.bump();
  }

  evictChannel(channelId: string): void {
    this.setState((s) => {
      const ids = s.byChannel[channelId] ?? [];
      const nextEntities = { ...s.entities };
      for (const id of ids) delete nextEntities[id];
      return {
        entities: nextEntities,
        byChannel: { ...s.byChannel, [channelId]: [] },
        cursors: { ...s.cursors, [channelId]: null },
        hasMore: { ...s.hasMore, [channelId]: false },
        initialLoadComplete: { ...s.initialLoadComplete, [channelId]: false },
      };
    });
    this.bump();
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

    // Beat 1 — no file? plain text send and bail.
    if (!hasBlob && !hasBuffer) {
      await this.send(channelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        senderUserId: options?.senderUserId ?? null,
        senderIsPlatformStaff: options?.senderIsPlatformStaff === true,
      });
      return;
    }

    // Beat 2 — upload, then send the message it'll attach to.
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

    // Beat 3 — attach + show optimistically; roll back on failure.
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
    target: import("@shared/lib/backend/types").MessageReportTarget;
    kind: import("@shared/lib/backend/types").MessageReportKind;
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

  clear(): void {
    this.setState(() => initialState());
    this.bump();
  }

  rehydrate(): void {
    // Solid cache persistence wired during app-build phase.
  }
}

export function createCommunityMessageSolidCache(
  communityId: string,
): CommunityMessageSolidCache {
  return new CommunityMessageSolidCache(communityId);
}
