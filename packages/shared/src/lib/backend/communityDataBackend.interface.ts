import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@shared/types/database';
import type {
  AuthorProfile,
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
  MessageAttachment,
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
  subscribeToChannels(
    communityId: string,
    onChange: () => void,
    options?: {
      onMemberBanned?: (payload: MemberBannedBroadcastPayload) => void;
      onMemberChannelAccessRevoked?: (
        payload: MemberChannelAccessRevokedBroadcastPayload
      ) => void;
      onReportStatusUpdated?: (payload: ReportStatusUpdatedBroadcastPayload) => void;
    }
  ): RealtimeChannel;
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
  listMessagesPage(input: {
    communityId: string;
    channelId: string;
    beforeCursor?: MessagePageCursor | null;
    /** When set (without beforeCursor), returns messages strictly newer than this cursor, ascending after reverse. */
    afterCursor?: MessagePageCursor | null;
    limit?: number;
  }): Promise<MessagePageResult>;
  subscribeToMessages(channelId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
  listMessageReactions(communityId: string, channelId: string): Promise<MessageReaction[]>;
  listMessageReactionsForMessages(input: {
    communityId: string;
    channelId: string;
    messageIds: string[];
  }): Promise<MessageReaction[]>;
  subscribeToMessageReactions(channelId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
  toggleMessageReaction(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    emoji: string;
  }): Promise<void>;
  listMessageAttachments(communityId: string, channelId: string): Promise<MessageAttachment[]>;
  listMessageAttachmentsForMessages(input: {
    communityId: string;
    channelId: string;
    messageIds: string[];
  }): Promise<MessageAttachment[]>;
  subscribeToMessageAttachments(channelId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
  cleanupExpiredMessageAttachments(limit?: number): Promise<number>;
  listMessageLinkPreviews(communityId: string, channelId: string): Promise<MessageLinkPreview[]>;
  listMessageLinkPreviewsForMessages(input: {
    communityId: string;
    channelId: string;
    messageIds: string[];
  }): Promise<MessageLinkPreview[]>;
  subscribeToMessageLinkPreviews(channelId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
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
  fetchAuthorProfiles(
    communityId: string,
    authorIds: string[]
  ): Promise<Record<string, AuthorProfile>>;
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
    userId: string;
    content: string;
    replyToMessageId?: string;
    mediaUpload?: {
      body: Blob | ArrayBuffer;
      filename?: string;
      expiresInHours?: number;
      /** Required when `body` is an `ArrayBuffer` (e.g. React Native). */
      contentType?: string;
    };
  }): Promise<void>;
  editUserMessage(input: {
    communityId: string;
    messageId: string;
    content: string;
  }): Promise<void>;
  deleteMessage(input: {
    communityId: string;
    messageId: string;
  }): Promise<void>;
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
