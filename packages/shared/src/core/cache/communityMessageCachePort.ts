import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  MessageBundle,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import type { SendCommunityMessageMediaOptions, ChannelMeta } from "@shared/features/messaging/logic/types";

/** Sync mutation surface used by routeRealtimeEvent and HavenCore orchestration. */
export interface CommunityMessageCacheInstance {
  setCommunityData(communityData: CommunityDataBackend): void;
  isCommunityDataAttached(): boolean;
  getSnapshot(messageId: string): MessageBundle | undefined;
  insertMessage(message: MessageBundle): void;
  upsertMessage(message: MessageBundle): void;
  removeMessage(messageId: string, channelId: string): void;
  evictChannel(channelId: string): void;
  ensureInitialLoaded(
    channelId: string,
    options?: { freshnessMs?: number },
  ): Promise<void>;
  loadOlder(channelId: string): Promise<void>;
  send(
    channelId: string,
    content: string,
    options?: {
      replyToMessageId?: string | null;
      senderUserId?: string | null;
      senderIsPlatformStaff?: boolean;
    },
  ): Promise<{ id: string }>;
  sendWithMedia(
    channelId: string,
    content: string,
    options?: { replyToMessageId?: string | null } & SendCommunityMessageMediaOptions,
  ): Promise<void>;
  requestLinkPreviewBackfill(
    channelId: string,
    messageIds: string[],
  ): Promise<void>;
  edit(messageId: string, content: string): Promise<void>;
  deleteMessageRpc(messageId: string): Promise<void>;
  toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void>;
  report(input: {
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }): Promise<void>;
  getLastMessageId(channelId: string): string | null;
  getChannelAuthorIds(channelId: string): string[];
  /** React-platform read surface (mobile + transitional web-client). */
  useChannel(channelId: string): MessageBundle[];
  useVisibleChannel(channelId: string): MessageBundle[];
  useChannelMeta(channelId: string): ChannelMeta;
  useIsLoadingInitial(channelId: string): boolean;
  useIsLoadingOlder(channelId: string): boolean;
  useHasInitialLoadCompleted(channelId: string): boolean;
  clear(): void;
  rehydrate(): void;
}

export interface CommunityMessageRegistry {
  for(communityId: string): CommunityMessageCacheInstance;
  setBackends(backends: { communityData: CommunityDataBackend }): void;
  has(communityId: string): boolean;
  clearCommunity(communityId: string): void;
  clearAll(): void;
}

export type CreateCommunityMessageRegistry = (
  persistence: import("@shared/core/persistence/NexusPersistence").NexusPersistence,
  viewerMessagePolicyStore: import("@shared/core/viewerMessagePolicy").ViewerMessagePolicyStore,
) => CommunityMessageRegistry;
