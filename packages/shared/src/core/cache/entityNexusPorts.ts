import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  Channel,
  ChannelGroupState,
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
  ExpoPushSubscriptionRecord,
  ExpoPushSubscriptionUpsertInput,
  NotificationItem,
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type {
  Community,
  CommunityNexusState,
} from "@shared/nexus/community/communityTypes";
import type {
  DmComposeDraftPeer,
  DirectMessageNexusState,
} from "@shared/nexus/direct-messages/dmTypes";
import type { NotificationNexusState } from "@shared/nexus/notifications/notificationTypes";
import type { NexusPersistence } from "../persistence/NexusPersistence";

export type { Community, CommunityNexusState, HavenChannel, ChannelNexusState };
export type { DmComposeDraftPeer, DirectMessageNexusState, NotificationNexusState };

export interface CommunityNexusPort {
  readonly reactiveStore: ReadableStore<CommunityNexusState>;
  setOnListChanged(listener: (() => void) | null): void;
  load(userId: string): Promise<void>;
  loadDisplayOrder(userId: string | null): void;
  setDisplayOrder(ids: string[], userId: string | null): void;
  resetDisplayOrder(userId: string | null): void;
  setCommunities(communities: Community[]): void;
  updateCommunity(id: string, changes: Partial<Community>): void;
  removeCommunity(id: string): void;
  setActiveId(id: string | null): void;
  getActiveId(): string | null;
  getIsLoading(): boolean;
  getCommunityIds(): string[];
  getCommunity(id: string): Community | undefined;
  getSnapshot(id: string): Community | undefined;
  rehydrate(): void;
  clear(): void;
}

export interface ChannelNexusPort {
  readonly reactiveStore: ReadableStore<ChannelNexusState>;
  loadForCommunity(communityId: string): Promise<void>;
  ensureLoaded(communityId: string): Promise<void>;
  upsertChannel(raw: Channel): void;
  setChannels(
    communityId: string,
    channels: Channel[],
    groupState: ChannelGroupState,
  ): void;
  updateChannel(id: string, changes: Partial<HavenChannel>): void;
  removeChannel(id: string, communityId: string): void;
  setActiveChannelId(id: string | null): void;
  getActiveChannelId(): string | null;
  getChannel(id: string): HavenChannel | undefined;
  getLastChannelId(communityId: string): string | null;
  getChannelsSnapshot(communityId: string): HavenChannel[];
  getDefaultChannelId(communityId: string): string | null;
  rehydrate(): void;
  clear(): void;
}

export interface DirectMessageNexusPort {
  readonly reactiveStore: ReadableStore<DirectMessageNexusState>;
  loadConversations(options?: { suppressLoadingState?: boolean }): Promise<void>;
  ensureConversationsLoaded(options?: {
    freshnessMs?: number;
    suppressLoadingState?: boolean;
  }): Promise<void>;
  loadMessages(conversationId: string): Promise<void>;
  ensureMessagesLoaded(
    conversationId: string,
    options?: { freshnessMs?: number },
  ): Promise<void>;
  openConversation(
    conversationId: string,
    options?: { markRead?: boolean },
  ): Promise<void>;
  openWithUser(otherUserId: string): Promise<string>;
  openDraftWithUser(targetUserId: string, displayName?: string | null): void;
  loadOlderMessages(conversationId: string): Promise<void>;
  sendMessage(
    conversationId: string,
    content: string,
    options?: {
      replyToMessageId?: string | null;
      imageUpload?: {
        body: Blob | ArrayBuffer;
        filename?: string;
        expiresInHours?: number;
        contentType?: string;
      };
      metadata?: Record<string, unknown>;
      optimisticAttachmentUri?: string | null;
    },
  ): Promise<{ messageId: string }>;
  setComposeDraftPeer(peer: DmComposeDraftPeer | null): void;
  setActiveConversationId(id: string | null): void;
  getOrCreateDirectConversation(otherUserId: string): Promise<string>;
  setMuted(conversationId: string, muted: boolean): Promise<boolean>;
  getConversationsSnapshot(): DirectMessageConversationSummary[];
  markRead(conversationId: string): Promise<boolean>;
  upsertMessage(message: DirectMessage): void;
  removeMessage(conversationId: string, messageId: string): void;
  clearFocusedConversation(): void;
  receiveMessage(conversationId: string, messageId: string): Promise<void>;
  receiveLatest(conversationId: string): Promise<void>;
  reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string>;
  rehydrate(): void;
  clear(): void;
}

export interface NotificationNexusPort {
  readonly reactiveStore: ReadableStore<NotificationNexusState>;
  loadInbox(): Promise<void>;
  ensureInbox(options?: { freshnessMs?: number }): Promise<void>;
  loadPreferences(): Promise<NotificationPreferences>;
  ensurePreferences(options?: { freshnessMs?: number }): Promise<NotificationPreferences | null>;
  refreshInbox(): Promise<void>;
  refreshCounts(): Promise<void>;
  markRead(recipientIds: string[]): Promise<void>;
  markSeen(recipientIds: string[]): Promise<void>;
  markAllSeen(): Promise<void>;
  dismiss(recipientIds: string[]): Promise<void>;
  setPreferences(preferences: NotificationPreferences | null): void;
  savePreferences(updates: NotificationPreferenceUpdate): Promise<NotificationPreferences>;
  upsertExpoPushSubscription(
    input: ExpoPushSubscriptionUpsertInput,
  ): Promise<ExpoPushSubscriptionRecord>;
  deleteExpoPushSubscription(subscriptionId: string): Promise<boolean>;
  upsertNotification(item: NotificationItem): void;
  rehydrate(): void;
  clear(): void;
}

export type CreateCommunityNexus = (
  persistence: NexusPersistence,
  controlPlane: ControlPlaneBackend,
) => CommunityNexusPort;

export type CreateChannelNexus = (
  persistence: NexusPersistence,
  communityData: CommunityDataBackend,
) => ChannelNexusPort;

export type CreateDirectMessageNexus = (
  persistence: NexusPersistence,
  backend: DirectMessageBackend,
) => DirectMessageNexusPort;

export type CreateNotificationNexus = (
  persistence: NexusPersistence,
  backend: NotificationBackend,
) => NotificationNexusPort;
