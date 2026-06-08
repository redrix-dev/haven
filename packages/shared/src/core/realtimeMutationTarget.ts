import type { HavenBackends } from "./backends";
import type {
  LiveProfileIdentity,
  MessageBundle,
  ReportStatusUpdatedBroadcastPayload,
} from "@shared/lib/backend/types";

/** Minimal message-cache mutation surface used by routeRealtimeEvent. */
export interface RealtimeMessageCache {
  insertMessage(message: MessageBundle): void;
  upsertMessage(message: MessageBundle): void;
  removeMessage(messageId: string, channelId: string): void;
  evictChannel(channelId: string): void;
}

export interface RealtimeMessageRegistry {
  for(communityId: string): RealtimeMessageCache;
}

export interface RealtimeChannelCache {
  loadForCommunity(communityId: string): Promise<void>;
  upsertChannel(raw: unknown): void;
  removeChannel(channelId: string, communityId: string): void;
}

export interface RealtimeCommunityCache {
  load(userId: string): Promise<void>;
}

export interface RealtimeProfileCache {
  removeProfile(userId: string): void;
  upsertProfile(profile: LiveProfileIdentity): void;
}

export interface RealtimeModerationCache {
  handleReportChange(payload: ReportStatusUpdatedBroadcastPayload): void;
  handleUserPlatformBanned(userId: string): void;
}

/**
 * Minimal mutation surface for shared routeRealtimeEvent.
 * Platform cores (HavenReactCore, future HavenSolidCore) implement this.
 */
export interface RealtimeMutationTarget {
  readonly backends: HavenBackends;
  readonly messages: RealtimeMessageRegistry;
  readonly channels: RealtimeChannelCache;
  readonly communities: RealtimeCommunityCache;
  readonly profiles: RealtimeProfileCache;
  readonly moderation: RealtimeModerationCache;
  onRoleChange(communityId: string): void;
  onNotificationEvent(payload: Record<string, unknown>): void;
  onDmConversationEvent(payload: Record<string, unknown>): void;
  onDmMessageEvent(payload: Record<string, unknown>): void;
  onSocialChange(payload: Record<string, unknown>): void;
  ensureCommunityPermissions(communityId: string): Promise<void>;
}
