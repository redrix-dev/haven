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
  defaultCanView: boolean;
  defaultCanSend: boolean;
  defaultCanManage: boolean;
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

export type NotificationKind =
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'dm_message'
  | 'channel_mention'
  | 'system';

export type NotificationSourceKind = 'friend_request' | 'dm_message' | 'message' | 'system_event';

export type NotificationItem = {
  recipientId: string;
  eventId: string;
  kind: NotificationKind;
  sourceKind: NotificationSourceKind;
  sourceId: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  payload: Record<string, unknown>;
  deliverInApp: boolean;
  deliverSound: boolean;
  createdAt: string;
  seenAt: string | null;
  readAt: string | null;
  dismissedAt: string | null;
};

export type NotificationCounts = {
  unseenCount: number;
  unreadCount: number;
};

export type NotificationPreferences = {
  userId: string;
  friendRequestInAppEnabled: boolean;
  friendRequestSoundEnabled: boolean;
  friendRequestPushEnabled: boolean;
  dmInAppEnabled: boolean;
  dmSoundEnabled: boolean;
  dmPushEnabled: boolean;
  mentionInAppEnabled: boolean;
  mentionSoundEnabled: boolean;
  mentionPushEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreferenceUpdate = {
  friendRequestInAppEnabled: boolean;
  friendRequestSoundEnabled: boolean;
  friendRequestPushEnabled: boolean;
  dmInAppEnabled: boolean;
  dmSoundEnabled: boolean;
  dmPushEnabled: boolean;
  mentionInAppEnabled: boolean;
  mentionSoundEnabled: boolean;
  mentionPushEnabled: boolean;
};

export type WebPushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  installationId: string | null;
  p256dhKey: string;
  authKey: string;
  expirationTime: string | null;
  userAgent: string | null;
  clientPlatform: string | null;
  appDisplayMode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type WebPushSubscriptionUpsertInput = {
  endpoint: string;
  installationId?: string | null;
  p256dhKey: string;
  authKey: string;
  expirationTime?: string | null;
  userAgent?: string | null;
  clientPlatform?: string | null;
  appDisplayMode?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationDeliveryTransport = 'web_push' | 'in_app' | 'simulated_push' | 'route_policy';

export type NotificationDeliveryDecisionStage = 'enqueue' | 'claim' | 'send_time' | 'client_route';

export type NotificationDeliveryDecision = 'send' | 'skip' | 'defer';

export type NotificationDeliveryReasonCode =
  | 'sent'
  | 'push_pref_disabled'
  | 'in_app_pref_disabled'
  | 'sound_pref_disabled'
  | 'dm_conversation_muted'
  | 'recipient_dismissed'
  | 'recipient_read'
  | 'no_active_push_subscription'
  | 'sw_focused_window_suppressed'
  | 'in_app_suppressed_due_to_push_active_background'
  | 'provider_retryable_failure'
  | 'provider_terminal_failure'
  | 'browser_push_unsupported'
  | 'notification_permission_not_granted'
  | 'service_worker_not_ready'
  | 'push_sync_disabled'
  | 'push_subscription_inactive'
  | 'app_focused'
  | 'app_backgrounded'
  | 'shadow_peek'
  | 'shadow_mode_no_send';

export type NotificationDeliveryTraceRecord = {
  id: string;
  notificationRecipientId: string | null;
  notificationEventId: string | null;
  recipientUserId: string | null;
  transport: NotificationDeliveryTransport;
  stage: NotificationDeliveryDecisionStage;
  decision: NotificationDeliveryDecision;
  reasonCode: NotificationDeliveryReasonCode | string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type WebPushDispatchWakeupDiagnostics = {
  enabled: boolean;
  shadowMode: boolean;
  minIntervalSeconds: number;
  lastAttemptedAt: string | null;
  lastRequestedAt: string | null;
  lastRequestId: number | null;
  lastMode: string | null;
  lastReason: string | null;
  lastSkipReason: string | null;
  lastError: string | null;
  totalAttempts: number;
  totalScheduled: number;
  totalDebounced: number;
  createdAt: string;
  updatedAt: string;
};

export type WebPushDispatchQueueHealthDiagnostics = {
  asOf: string;
  totalPending: number;
  totalRetryableFailed: number;
  totalProcessing: number;
  totalDone: number;
  totalDeadLetter: number;
  totalSkipped: number;
  claimableNowCount: number;
  pendingDueNowCount: number;
  retryableDueNowCount: number;
  processingLeaseExpiredCount: number;
  oldestClaimableAgeSeconds: number | null;
  oldestPendingAgeSeconds: number | null;
  oldestRetryableFailedAgeSeconds: number | null;
  oldestProcessingAgeSeconds: number | null;
  oldestProcessingLeaseOverdueSeconds: number | null;
  maxAttemptsActive: number | null;
  highRetryAttemptCount: number;
  deadLetterLast60mCount: number;
  retryableFailedLast10mCount: number;
  doneLast10mCount: number;
};

export type WebPushDispatchWakeupConfigUpdate = {
  enabled?: boolean | null;
  shadowMode?: boolean | null;
  minIntervalSeconds?: number | null;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'canceled';

export type FriendRequestDirection = 'incoming' | 'outgoing';

export type FriendSummary = {
  friendUserId: string;
  username: string;
  avatarUrl: string | null;
  friendshipCreatedAt: string;
  mutualCommunityCount: number;
  mutualCommunityNames: string[];
};

export type FriendRequestSummary = {
  requestId: string;
  direction: FriendRequestDirection;
  status: FriendRequestStatus;
  senderUserId: string;
  senderUsername: string;
  senderAvatarUrl: string | null;
  recipientUserId: string;
  recipientUsername: string;
  recipientAvatarUrl: string | null;
  createdAt: string;
  mutualCommunityCount: number;
  mutualCommunityNames: string[];
};

export type BlockedUserSummary = {
  blockedUserId: string;
  username: string;
  avatarUrl: string | null;
  blockedAt: string;
};

export type FriendSearchRelationshipState =
  | 'none'
  | 'friend'
  | 'incoming_pending'
  | 'outgoing_pending';

export type FriendSearchResult = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  relationshipState: FriendSearchRelationshipState;
  pendingRequestId: string | null;
  mutualCommunityCount: number;
  mutualCommunityNames: string[];
};

export type SocialCounts = {
  friendsCount: number;
  incomingPendingRequestCount: number;
  outgoingPendingRequestCount: number;
  blockedUserCount: number;
};

export type DirectMessageConversationSummary = {
  conversationId: string;
  kind: 'direct' | 'group';
  otherUserId: string | null;
  otherUsername: string | null;
  otherAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessageId: string | null;
  lastMessageAuthorUserId: string | null;
  lastMessagePreview: string | null;
  lastMessageCreatedAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  mutedUntil: string | null;
};

export type DirectMessage = {
  messageId: string;
  conversationId: string;
  authorUserId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type DirectMessageReportKind = 'content_abuse' | 'bug';

export type DmMessageReportStatus =
  | 'open'
  | 'triaged'
  | 'in_review'
  | 'resolved_actioned'
  | 'resolved_no_action'
  | 'dismissed';

export type DmMessageReportSummary = {
  reportId: string;
  conversationId: string;
  messageId: string;
  status: DmMessageReportStatus;
  kind: DirectMessageReportKind;
  comment: string;
  createdAt: string;
  updatedAt: string;
  reporterUserId: string;
  reporterUsername: string | null;
  reporterAvatarUrl: string | null;
  reportedUserId: string;
  reportedUsername: string | null;
  reportedAvatarUrl: string | null;
  assignedToUserId: string | null;
  assignedToUsername: string | null;
  assignedAt: string | null;
  messageCreatedAt: string | null;
  messageDeletedAt: string | null;
  messagePreview: string | null;
};

export type DmMessageReportDetail = {
  reportId: string;
  conversationId: string;
  messageId: string;
  status: DmMessageReportStatus;
  kind: DirectMessageReportKind;
  comment: string;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  reporterUserId: string;
  reporterUsername: string | null;
  reporterAvatarUrl: string | null;
  reportedUserId: string;
  reportedUsername: string | null;
  reportedAvatarUrl: string | null;
  assignedToUserId: string | null;
  assignedToUsername: string | null;
  assignedAt: string | null;
  messageAuthorUserId: string;
  messageAuthorUsername: string | null;
  messageAuthorAvatarUrl: string | null;
  messageContent: string;
  messageMetadata: Record<string, unknown>;
  messageCreatedAt: string;
  messageEditedAt: string | null;
  messageDeletedAt: string | null;
};

export type DmMessageReportContextMessage = {
  messageId: string;
  conversationId: string;
  authorUserId: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isTarget: boolean;
};

export type DmMessageReportAction = {
  actionId: string;
  reportId: string;
  actedByUserId: string;
  actedByUsername: string | null;
  actedByAvatarUrl: string | null;
  actionType: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
