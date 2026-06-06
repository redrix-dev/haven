import type { Database } from '@shared/types/database';
import type {
  BanCommunityMemberResult,
  BanEligibleServer,
  Channel,
  ChannelCreateInput,
  ChannelGroup,
  ChannelGroupState,
  ChannelAccessRevokedResult,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
  CommunityBanItem,
  CommunityMemberListItem,
  KickCommunityMemberResult,
  LiveProfileIdentity,
  MessageAttachment,
  MessageBundle,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
  ReportStatusUpdatedBroadcastPayload,
  ServerPermissions,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
} from './types';

type Message = Database['public']['Tables']['messages']['Row'];

export type MessagePageCursor = {
  createdAt: string;
  id: string;
};

export type MessagePageResult = {
  messages: Message[];
  hasMore: boolean;
};

export interface CommunityDataBackend {
  getMyPermissions(
    communityId: string,
  ): Promise<ServerPermissions & { isElevated: boolean }>;
  listCommunityMembers(communityId: string): Promise<CommunityMemberListItem[]>;
  reportUserProfile(input: {
    communityId: string;
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void>;
  reportPlatformUserProfile(input: {
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void>;
  listCommunityBans(communityId: string): Promise<CommunityBanItem[]>;
  banCommunityMember(input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<BanCommunityMemberResult>;
  kickCommunityMember(input: {
    communityId: string;
    targetUserId: string;
  }): Promise<KickCommunityMemberResult>;
  unbanCommunityMember(input: {
    communityId: string;
    targetUserId: string;
    reason?: string | null;
  }): Promise<void>;
  listBanEligibleServersForUser(targetUserId: string): Promise<BanEligibleServer[]>;
  listChannels(communityId: string): Promise<Channel[]>;
  /** Resolves the signed-in user's `community_members` row id and assigned `role_id`s in this community. */
  fetchMyMemberRoleAssignmentForRealtime(
    communityId: string,
    userId: string,
  ): Promise<{ memberId: string; roleIds: string[] } | null>;
  broadcastMemberBanned(input: MemberBannedBroadcastPayload): Promise<void>;
  broadcastMemberChannelAccessRevoked(
    input: MemberChannelAccessRevokedBroadcastPayload
  ): Promise<void>;
  broadcastReportStatusUpdated(
    input: ReportStatusUpdatedBroadcastPayload
  ): Promise<void>;
  listChannelGroups(input: {
    communityId: string;
    channelIds: string[];
  }): Promise<ChannelGroupState>;
  createChannelGroup(input: {
    communityId: string;
    name: string;
    position: number;
    createdByUserId: string;
  }): Promise<ChannelGroup>;
  renameChannelGroup(input: {
    communityId: string;
    groupId: string;
    name: string;
  }): Promise<void>;
  deleteChannelGroup(input: {
    communityId: string;
    groupId: string;
  }): Promise<void>;
  setChannelGroupForChannel(input: {
    communityId: string;
    channelId: string;
    groupId: string | null;
    position: number;
  }): Promise<void>;
  setChannelGroupCollapsed(input: {
    communityId: string;
    groupId: string;
    isCollapsed: boolean;
  }): Promise<void>;
  listMessages(communityId: string, channelId: string): Promise<Message[]>;
  listChannelMessages(input: {
    communityId: string;
    channelId: string;
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeMessageId?: string | null;
  }): Promise<{ messages: MessageBundle[]; hasMore: boolean }>;
  getChannelMessage(input: {
    communityId: string;
    channelId: string;
    messageId: string;
  }): Promise<MessageBundle | null>;
  /**
   * Batch-fetch the *live* identity (current username + avatar) for a set of
   * message authors. Community messages only carry an avatar snapshot taken at
   * send time, so this lets the client prime ProfileNexus and render current
   * avatars that self-heal when an author changes their profile.
   */
  fetchMessageAuthorProfiles(input: {
    communityId: string;
    authorUserIds: string[];
  }): Promise<LiveProfileIdentity[]>;
  listMessageReactions(communityId: string, channelId: string): Promise<MessageReaction[]>;
  toggleMessageReaction(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    emoji: string;
  }): Promise<void>;
  listMessageAttachments(communityId: string, channelId: string): Promise<MessageAttachment[]>;
  cleanupExpiredMessageAttachments(limit?: number): Promise<number>;
  listMessageLinkPreviews(communityId: string, channelId: string): Promise<MessageLinkPreview[]>;
  requestChannelLinkPreviewBackfill(input: {
    communityId: string;
    channelId: string;
    messageIds: string[];
  }): Promise<{ queued: number; skipped: number; alreadyPresent: number; requested: number }>;
  runMessageMediaMaintenance(limit?: number): Promise<{
    deletedMessages: number;
    claimedDeletionJobs: number;
    deletedObjects: number;
    retryableFailures: number;
    deadLetters: number;
  }>;
  isElevatedInServer(communityId: string): Promise<boolean>;
  canSendInChannel(channelId: string): Promise<boolean>;
  fetchServerSettings(communityId: string): Promise<ServerSettingsSnapshot>;
  updateServerSettings(input: {
    communityId: string;
    values: ServerSettingsUpdate;
  }): Promise<void>;
  fetchServerRoleManagement(communityId: string): Promise<ServerRoleManagementSnapshot>;
  createServerRole(input: {
    communityId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  updateServerRole(input: {
    communityId: string;
    roleId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  deleteServerRole(input: { communityId: string; roleId: string }): Promise<void>;
  saveServerRolePermissions(input: {
    roleId: string;
    permissionKeys: string[];
  }): Promise<void>;
  saveServerMemberRoles(input: {
    communityId: string;
    memberId: string;
    roleIds: string[];
    assignedByUserId: string;
  }): Promise<void>;
  createChannel(input: ChannelCreateInput): Promise<Channel>;
  fetchChannelPermissions(input: {
    communityId: string;
    channelId: string;
    userId: string;
  }): Promise<ChannelPermissionsSnapshot>;
  saveRoleChannelPermissions(input: {
    communityId: string;
    channelId: string;
    roleId: string;
    permissions: ChannelPermissionState;
  }): Promise<void>;
  saveMemberChannelPermissions(input: {
    communityId: string;
    channelId: string;
    memberId: string;
    permissions: ChannelPermissionState;
  }): Promise<ChannelAccessRevokedResult | null>;
  listChannelRevokedUserIds(input: {
    communityId: string;
    channelId: string;
  }): Promise<string[]>;
  updateChannel(input: {
    communityId: string;
    channelId: string;
    name: string;
    topic: string | null;
  }): Promise<void>;
  deleteChannel(input: { communityId: string; channelId: string }): Promise<void>;
  sendUserMessage(input: {
    communityId: string;
    channelId: string;
    content: string;
    replyToMessageId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  uploadMessageMedia(input: {
    communityId: string;
    channelId: string;
    file: Blob | ArrayBuffer;
    filename?: string;
    mimeType: string;
    expiresInHours: 1 | 24 | 168 | 720;
    contentType?: string;
  }): Promise<{
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    mediaKind: 'image' | 'video' | 'file';
    expiresAt: string;
  }>;
  insertMessageAttachment(input: {
    messageId: string;
    communityId: string;
    channelId: string;
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    mediaKind: 'image' | 'video' | 'file';
    filename?: string;
    expiresAt: string;
  }): Promise<void>;
  editUserMessage(input: {
    communityId: string;
    messageId: string;
    content: string;
  }): Promise<void>;
  deleteMessage(input: { communityId: string; messageId: string }): Promise<void>;
  deleteMessage(input: { messageId: string }): Promise<void>;
  reportMessage(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }): Promise<void>;
}
