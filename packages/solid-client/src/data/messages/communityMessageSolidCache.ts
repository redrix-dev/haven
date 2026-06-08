import { createStore } from "solid-js/store";
import type { MessageBundle } from "@shared/lib/backend/types";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { CommunityMessageCacheInstance } from "@shared/core/cache/communityMessageCachePort";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import {
  MESSAGE_PAGE_SIZE,
  ascendingMessagesFromRpcPage,
  buildOptimisticSendBundle,
  insertMessageIntoChannelIndex,
  oldestMessageCursor,
  removeMessageIdFromChannelIndex,
  shouldSkipInitialReload,
  type ChannelMeta,
  type SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";

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
export class CommunityMessageSolidCache implements CommunityMessageCacheInstance {
  private state: CommunityMessageSolidState;
  private readonly setState: (
    updater: (
      state: CommunityMessageSolidState,
    ) => Partial<CommunityMessageSolidState> | CommunityMessageSolidState,
  ) => void;
  private communityData: CommunityDataBackend | null = null;

  constructor(private readonly communityId: string) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
  }

  setCommunityData(communityData: CommunityDataBackend): void {
    this.communityData = communityData;
  }

  isCommunityDataAttached(): boolean {
    return this.communityData !== null;
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
      lastInitialLoadedAt: { ...s.lastInitialLoadedAt, [channelId]: Date.now() },
    }));
  }

  async loadOlder(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        "CommunityMessageSolidCache.loadOlder called before backend attached.",
      );
    }
    const hasMore = this.state.hasMore[channelId] ?? false;
    if (!hasMore) return;
    const ids = this.state.byChannel[channelId] ?? [];
    const oldest = this.state.entities[ids[0]]?.data;
    if (!oldest) return;

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
    options?: { replyToMessageId?: string | null } & SendCommunityMessageMediaOptions,
  ): Promise<void> {
    void channelId;
    void content;
    void options;
    throw new Error("CommunityMessageSolidCache.sendWithMedia not implemented yet");
  }

  async requestLinkPreviewBackfill(
    channelId: string,
    messageIds: string[],
  ): Promise<void> {
    void channelId;
    void messageIds;
    throw new Error("not implemented");
  }

  async edit(messageId: string, content: string): Promise<void> {
    void messageId;
    void content;
    throw new Error("not implemented");
  }

  async deleteMessageRpc(messageId: string): Promise<void> {
    void messageId;
    throw new Error("not implemented");
  }

  async toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    void channelId;
    void messageId;
    void emoji;
    throw new Error("not implemented");
  }

  async report(input: {
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: import("@shared/lib/backend/types").MessageReportTarget;
    kind: import("@shared/lib/backend/types").MessageReportKind;
    comment: string;
  }): Promise<void> {
    void input;
    throw new Error("not implemented");
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
