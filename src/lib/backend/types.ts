import { Database } from '@/types/database';

export type Channel = Database['public']['Tables']['channels']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type DeveloperAccessMode = Database['public']['Enums']['developer_access_mode'];
export type ChannelKind = Database['public']['Enums']['channel_kind'];
export type MessageReaction = {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
};

export type MessageAttachment = {
  id: string;
  messageId: string;
  communityId: string;
  channelId: string;
  ownerUserId: string;
  bucketName: string;
  objectPath: string;
  originalFilename: string | null;
  mimeType: string;
  mediaKind: 'image' | 'video' | 'file';
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  signedUrl: string | null;
};

export type LinkPreviewStatus = 'pending' | 'ready' | 'unsupported' | 'failed';
export type LinkPreviewEmbedProvider = 'none' | 'youtube' | 'vimeo';

export type LinkPreviewEmbed = {
  provider: 'youtube' | 'vimeo';
  embedUrl: string;
  aspectRatio: number;
};

export type LinkPreviewThumbnail = {
  bucketName: string | null;
  objectPath: string | null;
  sourceUrl: string | null;
  signedUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
};

export type LinkPreviewSnapshot = {
  sourceUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  canonicalUrl: string | null;
  thumbnail: LinkPreviewThumbnail | null;
  embed: LinkPreviewEmbed | null;
};

export type MessageLinkPreview = {
  id: string;
  messageId: string;
  communityId: string;
  channelId: string;
  sourceUrl: string | null;
  normalizedUrl: string | null;
  status: LinkPreviewStatus;
  cacheId: string | null;
  snapshot: LinkPreviewSnapshot | null;
  embedProvider: LinkPreviewEmbedProvider;
  thumbnailBucketName: string | null;
  thumbnailObjectPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeatureFlagKey = string;
export type FeatureFlagsSnapshot = Record<FeatureFlagKey, boolean>;

export type ServerSummary = {
  id: string;
  name: string;
  created_at: string;
};

export type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

export type ServerPermissions = {
  isOwner: boolean;
  canManageServer: boolean;
  canManageRoles: boolean;
  canManageMembers: boolean;
  canCreateChannels: boolean;
  canManageChannels: boolean;
  canManageMessages: boolean;
  canManageBans: boolean;
  canCreateReports: boolean;
  canRefreshLinkPreviews: boolean;
  canManageDeveloperAccess: boolean;
  canManageInvites: boolean;
};

export type CommunityMemberListItem = {
  memberId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
  joinedAt: string;
};

export type CommunityBanItem = {
  id: string;
  communityId: string;
  bannedUserId: string;
  bannedByUserId: string;
  reason: string;
  bannedAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokedReason: string | null;
  username: string;
  avatarUrl: string | null;
};

export type BanEligibleServer = {
  communityId: string;
  communityName: string;
};

export type ServerSettingsSnapshot = {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
  developerAccessEnabled: boolean;
  developerAccessMode: DeveloperAccessMode;
  developerAccessChannelIds: string[];
};

export type ServerSettingsUpdate = {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
  developerAccessEnabled: boolean;
  developerAccessMode: DeveloperAccessMode;
  developerAccessChannelIds: string[];
};

export type PermissionCatalogItem = {
  key: string;
  description: string;
};

export type ServerRoleItem = {
  id: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  isSystem: boolean;
  permissionKeys: string[];
  memberCount: number;
};

export type ServerMemberRoleItem = {
  memberId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
  roleIds: string[];
};

export type ServerRoleManagementSnapshot = {
  roles: ServerRoleItem[];
  members: ServerMemberRoleItem[];
  permissionsCatalog: PermissionCatalogItem[];
};

export type ServerInvite = {
  id: string;
  code: string;
  currentUses: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
};

export type RedeemedInvite = {
  communityId: string;
  communityName: string;
  joined: boolean;
};

export type ChannelPermissionState = {
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelCreateInput = {
  communityId: string;
  name: string;
  topic: string | null;
  kind: ChannelKind;
  position: number;
};

export type ChannelRolePermissionItem = {
  roleId: string;
  name: string;
  color: string;
  isDefault: boolean;
  editable: boolean;
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelMemberPermissionItem = {
  memberId: string;
  displayName: string;
  isOwner: boolean;
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelMemberOption = {
  memberId: string;
  displayName: string;
  isOwner: boolean;
};

export type ChannelPermissionsSnapshot = {
  rolePermissions: ChannelRolePermissionItem[];
  memberPermissions: ChannelMemberPermissionItem[];
  memberOptions: ChannelMemberOption[];
};

export type ChannelGroup = {
  id: string;
  communityId: string;
  name: string;
  position: number;
  channelIds: string[];
};

export type ChannelGroupState = {
  groups: ChannelGroup[];
  ungroupedChannelIds: string[];
  collapsedGroupIds: string[];
};

export type MessageReportTarget = 'server_admins' | 'haven_developers' | 'both';

export type MessageReportKind = 'content_abuse' | 'bug';
