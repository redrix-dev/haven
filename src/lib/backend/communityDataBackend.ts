import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { messageObjectStore } from './messageObjectStore';
import type {
  AuthorProfile,
  BanEligibleServer,
  Channel,
  ChannelCreateInput,
  ChannelGroup,
  ChannelGroupState,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
  ChannelRolePermissionItem,
  CommunityBanItem,
  CommunityMemberListItem,
  PermissionCatalogItem,
  MessageReportKind,
  MessageReportTarget,
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
  LinkPreviewSnapshot,
  LinkPreviewStatus,
  LinkPreviewEmbedProvider,
} from './types';

type CommunityMemberWithProfile = Pick<
  Database['public']['Tables']['community_members']['Row'],
  'id' | 'nickname' | 'is_owner' | 'user_id' | 'joined_at'
> & {
  profiles:
    | Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>
    | Array<Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>>
    | null;
};

const getRealtimeRowChannelId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const maybeChannelId = (value as { channel_id?: unknown }).channel_id;
  return typeof maybeChannelId === 'string' ? maybeChannelId : null;
};

const MESSAGE_MEDIA_BUCKET = 'message-media';
const LINK_PREVIEW_IMAGE_BUCKET = 'link-preview-images';
const DEFAULT_MEDIA_EXPIRES_IN_HOURS = 24;
const MAX_MEDIA_EXPIRES_IN_HOURS = 24 * 30;
const MEDIA_ONLY_CONTENT_PLACEHOLDER = '\u200B';

const sanitizeFileName = (value: string): string => {
  const sanitized = value
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  return sanitized.length > 0 ? sanitized.slice(0, 120) : 'media';
};

const resolveMediaKind = (mimeType: string): 'image' | 'video' | 'file' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
};

type MessageReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type MessageAttachmentRow = {
  id: string;
  message_id: string;
  community_id: string;
  channel_id: string;
  owner_user_id: string;
  bucket_name: string;
  object_path: string;
  original_filename: string | null;
  mime_type: string;
  media_kind: 'image' | 'video' | 'file';
  size_bytes: number;
  created_at: string;
  expires_at: string;
};

type MessageAttachmentStorageRow = {
  bucket_name: string;
  object_path: string;
};

type MessageLinkPreviewRow = {
  id: string;
  message_id: string;
  community_id: string;
  channel_id: string;
  source_url: string | null;
  normalized_url: string | null;
  status: LinkPreviewStatus;
  cache_id: string | null;
  snapshot: unknown;
  embed_provider: LinkPreviewEmbedProvider;
  thumbnail_bucket_name: string | null;
  thumbnail_object_path: string | null;
  created_at: string;
  updated_at: string;
};

type MessageLinkPreviewThumbnail = NonNullable<LinkPreviewSnapshot['thumbnail']>;

type MessagePageCursor = {
  createdAt: string;
  id: string;
};

type MessagePageResult = {
  messages: Message[];
  hasMore: boolean;
};

const asObjectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const asOptionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeLinkPreviewSnapshot = (value: unknown): LinkPreviewSnapshot | null => {
  const obj = asObjectRecord(value);
  if (!obj) return null;

  const thumbnailObj = asObjectRecord(obj.thumbnail);
  const embedObj = asObjectRecord(obj.embed);
  const embedProvider =
    embedObj?.provider === 'youtube' || embedObj?.provider === 'vimeo'
      ? embedObj.provider
      : null;

  const embed: LinkPreviewSnapshot['embed'] =
    embedObj &&
    embedProvider &&
    typeof embedObj.embedUrl === 'string' &&
    embedObj.embedUrl.trim().length > 0
      ? {
          provider: embedProvider,
          embedUrl: embedObj.embedUrl,
          aspectRatio: asOptionalNumber(embedObj.aspectRatio) ?? 16 / 9,
        }
      : null;

  const thumbnail: MessageLinkPreviewThumbnail | null = thumbnailObj
    ? {
        bucketName: asOptionalString(thumbnailObj.bucketName),
        objectPath: asOptionalString(thumbnailObj.objectPath),
        sourceUrl: asOptionalString(thumbnailObj.sourceUrl),
        signedUrl: null,
        width: asOptionalNumber(thumbnailObj.width),
        height: asOptionalNumber(thumbnailObj.height),
        mimeType: asOptionalString(thumbnailObj.mimeType),
      }
    : null;

  const sourceUrl = asOptionalString(obj.sourceUrl);
  const normalizedUrl = asOptionalString(obj.normalizedUrl);
  if (!sourceUrl || !normalizedUrl) return null;

  return {
    sourceUrl,
    normalizedUrl,
    finalUrl: asOptionalString(obj.finalUrl),
    title: asOptionalString(obj.title),
    description: asOptionalString(obj.description),
    siteName: asOptionalString(obj.siteName),
    canonicalUrl: asOptionalString(obj.canonicalUrl),
    thumbnail,
    embed,
  };
};

const supabaseFunctionJson = async <TResponse>(functionName: string, body: unknown): Promise<TResponse> => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or key is missing.');
  }

  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('No authenticated session token available.');
    }
    return accessToken;
  };

  const callWithToken = async (accessToken: string): Promise<{
    ok: boolean;
    status: number;
    parsed: unknown;
  }> => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
    });

    const rawBody = await response.text();
    let parsed: unknown = null;
    if (rawBody.trim().length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = rawBody;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      parsed,
    };
  };

  let result = await callWithToken(await getAccessToken());

  const errorMessageFromParsed = (parsed: unknown, status: number): string =>
    parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as { message: unknown }).message === 'string'
      ? (parsed as { message: string }).message
      : `Function ${functionName} failed (${status}).`;

  if (!result.ok && result.status === 401) {
    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        result = await callWithToken(refreshed.session.access_token);
      }
    } catch {
      // Fall through to the original error handling.
    }
  }

  if (!result.ok) {
    throw new Error(errorMessageFromParsed(result.parsed, result.status));
  }

  return result.parsed as TResponse;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForConfirmedSupabaseSession = async (timeoutMs = 4000): Promise<boolean> => {
  const startedAt = Date.now();
  let refreshAttempted = false;

  while (Date.now() - startedAt < timeoutMs) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (!sessionError && session?.access_token) {
      const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
      if (!userError && userData.user) {
        return true;
      }
    }

    if (!refreshAttempted) {
      refreshAttempted = true;
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const { data: refreshedUser, error: refreshedUserError } = await supabase.auth.getUser(
            refreshed.session.access_token
          );
          if (!refreshedUserError && refreshedUser.user) {
            return true;
          }
        }
      } catch {
        // Fall through to retry loop.
      }
    }

    await sleep(250);
  }

  return false;
};

type UploadedMessageMedia = {
  bucketName: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  mediaKind: 'image' | 'video' | 'file';
  sizeBytes: number;
  expiresAt: string;
};

const uploadMessageMediaToObjectStore = async (input: {
  communityId: string;
  channelId: string;
  mediaUpload?: {
    file: File;
    expiresInHours?: number;
  };
}): Promise<UploadedMessageMedia | null> => {
  if (!input.mediaUpload?.file) return null;

  const nextFile = input.mediaUpload.file;
  const expiresInHours = input.mediaUpload.expiresInHours ?? DEFAULT_MEDIA_EXPIRES_IN_HOURS;
  const boundedExpiresInHours = Math.min(
    Math.max(Math.floor(expiresInHours), 1),
    MAX_MEDIA_EXPIRES_IN_HOURS
  );
  const originalFilename = sanitizeFileName(nextFile.name || 'media');
  const objectPath = `${input.communityId}/${input.channelId}/${crypto.randomUUID()}-${originalFilename}`;
  const mimeType = nextFile.type?.trim() || 'application/octet-stream';

  await messageObjectStore.uploadMessageAttachment({
    bucketName: MESSAGE_MEDIA_BUCKET,
    objectPath,
    file: nextFile,
    contentType: mimeType,
    cacheControl: '3600',
  });

  return {
    bucketName: MESSAGE_MEDIA_BUCKET,
    objectPath,
    originalFilename,
    mimeType,
    mediaKind: resolveMediaKind(mimeType),
    sizeBytes: nextFile.size,
    expiresAt: new Date(Date.now() + boundedExpiresInHours * 60 * 60 * 1000).toISOString(),
  };
};

const removeUploadedMediaObject = async (uploadedMedia: UploadedMessageMedia | null): Promise<void> => {
  if (!uploadedMedia) return;
  try {
    await messageObjectStore.removeObjects(uploadedMedia.bucketName, [uploadedMedia.objectPath]);
  } catch {
    // Best-effort rollback/cleanup.
  }
};

const mapMessageReactionRows = (rows: MessageReactionRow[]): MessageReaction[] =>
  rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
  }));

const mapMessageAttachmentRowsWithSignedUrls = async (
  attachmentRows: MessageAttachmentRow[]
): Promise<MessageAttachment[]> => {
  if (attachmentRows.length === 0) return [];

  const pathsByBucket = new Map<string, string[]>();
  for (const row of attachmentRows) {
    const existingPaths = pathsByBucket.get(row.bucket_name) ?? [];
    existingPaths.push(row.object_path);
    pathsByBucket.set(row.bucket_name, existingPaths);
  }

  const signedUrlByBucketAndPath = new Map<string, string>();
  for (const [bucketName, paths] of pathsByBucket.entries()) {
    try {
      const signedRowsByPath = await messageObjectStore.createSignedUrls(bucketName, paths, 60 * 60);
      for (const [path, signedUrl] of Object.entries(signedRowsByPath)) {
        signedUrlByBucketAndPath.set(`${bucketName}/${path}`, signedUrl);
      }
    } catch (signedError) {
      console.error('Failed to create signed URLs for message attachments:', signedError);
    }
  }

  return attachmentRows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    communityId: row.community_id,
    channelId: row.channel_id,
    ownerUserId: row.owner_user_id,
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    mediaKind: row.media_kind,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    signedUrl: signedUrlByBucketAndPath.get(`${row.bucket_name}/${row.object_path}`) ?? null,
  }));
};

const mapMessageLinkPreviewRowsWithSignedUrls = async (
  previewRows: MessageLinkPreviewRow[]
): Promise<MessageLinkPreview[]> => {
  if (previewRows.length === 0) return [];

  const pathsByBucket = new Map<string, string[]>();
  for (const row of previewRows) {
    const snapshot = normalizeLinkPreviewSnapshot(row.snapshot);
    const bucketName = row.thumbnail_bucket_name ?? snapshot?.thumbnail?.bucketName ?? null;
    const objectPath = row.thumbnail_object_path ?? snapshot?.thumbnail?.objectPath ?? null;
    if (!bucketName || !objectPath) continue;
    if (bucketName !== LINK_PREVIEW_IMAGE_BUCKET) continue;
    const existing = pathsByBucket.get(bucketName) ?? [];
    if (!existing.includes(objectPath)) existing.push(objectPath);
    pathsByBucket.set(bucketName, existing);
  }

  const signedUrlByBucketAndPath = new Map<string, string>();
  for (const [bucketName, paths] of pathsByBucket.entries()) {
    try {
      const signedRowsByPath = await messageObjectStore.createSignedUrls(bucketName, paths, 60 * 30);
      for (const [path, signedUrl] of Object.entries(signedRowsByPath)) {
        signedUrlByBucketAndPath.set(`${bucketName}/${path}`, signedUrl);
      }
    } catch (signedError) {
      console.warn('Failed to create signed URLs for link preview thumbnails:', signedError);
    }
  }

  return previewRows.map((row) => {
    const snapshot = normalizeLinkPreviewSnapshot(row.snapshot);
    const bucketName = row.thumbnail_bucket_name ?? snapshot?.thumbnail?.bucketName ?? null;
    const objectPath = row.thumbnail_object_path ?? snapshot?.thumbnail?.objectPath ?? null;
    const signedUrl =
      bucketName && objectPath
        ? signedUrlByBucketAndPath.get(`${bucketName}/${objectPath}`) ?? null
        : null;

    const normalizedSnapshot: LinkPreviewSnapshot | null = snapshot
      ? {
          ...snapshot,
          thumbnail: snapshot.thumbnail
            ? {
                ...snapshot.thumbnail,
                bucketName,
                objectPath,
                signedUrl,
              }
            : null,
        }
      : null;

    return {
      id: row.id,
      messageId: row.message_id,
      communityId: row.community_id,
      channelId: row.channel_id,
      sourceUrl: row.source_url,
      normalizedUrl: row.normalized_url,
      status: row.status,
      cacheId: row.cache_id,
      snapshot: normalizedSnapshot,
      embedProvider: row.embed_provider,
      thumbnailBucketName: bucketName,
      thumbnailObjectPath: objectPath,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
};

// Incident toggle for channel-create debugging.
// Keep disabled by default. Re-enable by setting `HAVEN_DEBUG_CHANNEL_CREATE=1`.
// const ENABLE_CHANNEL_CREATE_DIAGNOSTICS = process.env.HAVEN_DEBUG_CHANNEL_CREATE === '1';

export interface CommunityDataBackend {
  fetchServerPermissions(communityId: string): Promise<ServerPermissions>;
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
  }): Promise<void>;
  unbanCommunityMember(input: {
    communityId: string;
    targetUserId: string;
    reason?: string | null;
  }): Promise<void>;
  listBanEligibleServersForUser(targetUserId: string): Promise<BanEligibleServer[]>;
  listChannels(communityId: string): Promise<Channel[]>;
  subscribeToChannels(communityId: string, onChange: () => void): RealtimeChannel;
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
  fetchAuthorProfiles(authorIds: string[]): Promise<Record<string, AuthorProfile>>;
  isHavenDeveloperMessagingAllowed(input: {
    communityId: string;
    channelId: string;
  }): Promise<boolean>;
  canSendInChannel(channelId: string): Promise<boolean>;
  fetchServerSettings(communityId: string): Promise<ServerSettingsSnapshot>;
  updateServerSettings(input: {
    communityId: string;
    userId: string;
    values: ServerSettingsUpdate;
    canManageDeveloperAccess: boolean;
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
  }): Promise<void>;
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
      file: File;
      expiresInHours?: number;
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
  postHavenDeveloperMessage(input: {
    communityId: string;
    channelId: string;
    content: string;
    replyToMessageId?: string;
    mediaUpload?: {
      file: File;
      expiresInHours?: number;
    };
  }): Promise<void>;
}

export const centralCommunityDataBackend: CommunityDataBackend = {
  async fetchServerPermissions(communityId) {
    const [
      { data: isOwner },
      { data: canManageServer },
      { data: canManageRoles },
      { data: canManageMembers },
      { data: canCreateChannels },
      { data: canManageChannels },
      { data: canManageMessages },
      { data: canManageBans },
      { data: canCreateReports },
      { data: canRefreshLinkPreviews },
      { data: canManageDeveloperAccess },
      { data: canManageInvites },
    ] = await Promise.all([
      supabase.rpc('is_community_owner', { p_community_id: communityId }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_server',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_roles',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_members',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'create_channels',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_channels',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_messages',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_bans',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'create_reports',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'refresh_link_previews',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_developer_access',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_invites',
      }),
    ]);

    const owner = Boolean(isOwner);
    const manageChannels = owner || Boolean(canManageChannels);

    return {
      isOwner: owner,
      canManageServer: owner || Boolean(canManageServer),
      canManageRoles: owner || Boolean(canManageRoles),
      canManageMembers: owner || Boolean(canManageMembers),
      canCreateChannels: owner || Boolean(canCreateChannels) || manageChannels,
      canManageChannels: manageChannels,
      canManageMessages: owner || Boolean(canManageMessages),
      canManageBans: owner || Boolean(canManageBans),
      canCreateReports: owner || Boolean(canCreateReports),
      canRefreshLinkPreviews: owner || Boolean(canRefreshLinkPreviews),
      canManageDeveloperAccess: owner || Boolean(canManageDeveloperAccess),
      canManageInvites: owner || Boolean(canManageInvites),
    };
  },

  async listCommunityMembers(communityId) {
    const { data, error } = await supabase
      .from('community_members')
      .select('id, user_id, nickname, is_owner, joined_at, profiles(username, avatar_url)')
      .eq('community_id', communityId)
      .order('joined_at', { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as CommunityMemberWithProfile[];
    return rows
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const displayName =
          member.nickname?.trim() || profile?.username || member.user_id.substring(0, 12);

        return {
          memberId: member.id,
          userId: member.user_id,
          displayName,
          avatarUrl: profile?.avatar_url ?? null,
          isOwner: Boolean(member.is_owner),
          joinedAt: member.joined_at,
        };
      })
      .sort((left, right) => {
        if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;
        return left.displayName.localeCompare(right.displayName);
      });
  },

  async reportUserProfile({ communityId, targetUserId, reporterUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error('Report reason is required.');
    }

    const reportId = crypto.randomUUID();
    const reportTitle = 'User Report: Profile';
    const reportNotes = JSON.stringify({
      type: 'user_report',
      targetUserId,
      reason: normalizedReason,
    });

    const { error } = await supabase.from('support_reports').insert({
      id: reportId,
      community_id: communityId,
      reporter_user_id: reporterUserId,
      title: reportTitle,
      notes: reportNotes,
      include_last_n_messages: null,
    });
    if (error) throw error;
  },

  async listCommunityBans(communityId) {
    const { data, error } = await supabase
      .from('community_bans')
      .select(
        'id, community_id, banned_user_id, banned_by_user_id, reason, banned_at, revoked_at, revoked_by_user_id, revoked_reason, profiles:banned_user_id(username, avatar_url)'
      )
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .order('banned_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row) => {
      const profileRaw = (row as { profiles?: unknown }).profiles;
      const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const profileRecord =
        profile && typeof profile === 'object'
          ? (profile as { username?: string | null; avatar_url?: string | null })
          : null;

      return {
        id: row.id,
        communityId: row.community_id,
        bannedUserId: row.banned_user_id,
        bannedByUserId: row.banned_by_user_id,
        reason: row.reason,
        bannedAt: row.banned_at,
        revokedAt: row.revoked_at,
        revokedByUserId: row.revoked_by_user_id,
        revokedReason: row.revoked_reason,
        username: profileRecord?.username ?? row.banned_user_id.substring(0, 12),
        avatarUrl: profileRecord?.avatar_url ?? null,
      } satisfies CommunityBanItem;
    });
  },

  async banCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error('Ban reason is required.');
    }

    const { error } = await supabase.rpc('ban_community_member', {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
      p_reason: normalizedReason,
    });
    if (error) throw error;
  },

  async unbanCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason?.trim() ?? null;
    const { error } = await supabase.rpc('unban_community_member', {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
      p_reason: normalizedReason && normalizedReason.length > 0 ? normalizedReason : undefined,
    });
    if (error) throw error;
  },

  async listBanEligibleServersForUser(targetUserId) {
    if (!targetUserId) return [];

    const { data, error } = await supabase.rpc('list_bannable_shared_communities', {
      p_target_user_id: targetUserId,
    });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      communityId: row.community_id,
      communityName: row.community_name,
    }));
  },

  async listChannels(communityId) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('community_id', communityId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async listChannelGroups({ communityId, channelIds }) {
    const [
      { data: groupRows, error: groupRowsError },
      { data: mappingRows, error: mappingRowsError },
      authResult,
    ] = await Promise.all([
      supabase
        .from('channel_groups')
        .select('id, community_id, name, position')
        .eq('community_id', communityId)
        .order('position', { ascending: true }),
      supabase
        .from('channel_group_channels')
        .select('channel_id, group_id, position')
        .eq('community_id', communityId)
        .order('position', { ascending: true }),
      supabase.auth.getUser(),
    ]);

    if (groupRowsError) throw groupRowsError;
    if (mappingRowsError) throw mappingRowsError;
    if (authResult.error) throw authResult.error;

    const currentUserId = authResult.data.user?.id ?? null;

    let collapsedGroupIds: string[] = [];
    if (currentUserId) {
      const { data: preferenceRows, error: preferenceRowsError } = await supabase
        .from('channel_group_preferences')
        .select('group_id, is_collapsed')
        .eq('community_id', communityId)
        .eq('user_id', currentUserId)
        .eq('is_collapsed', true);
      if (preferenceRowsError) throw preferenceRowsError;
      collapsedGroupIds = (preferenceRows ?? []).map((row) => row.group_id);
    }

    const channelIdsByGroupId = new Map<string, string[]>();
    for (const mappingRow of mappingRows ?? []) {
      const existing = channelIdsByGroupId.get(mappingRow.group_id) ?? [];
      existing.push(mappingRow.channel_id);
      channelIdsByGroupId.set(mappingRow.group_id, existing);
    }

    const groups: ChannelGroup[] = (groupRows ?? []).map((groupRow) => ({
      id: groupRow.id,
      communityId: groupRow.community_id,
      name: groupRow.name,
      position: groupRow.position,
      channelIds: channelIdsByGroupId.get(groupRow.id) ?? [],
    }));

    const groupedChannelIds = new Set(
      Array.from(channelIdsByGroupId.values()).flat()
    );

    return {
      groups,
      ungroupedChannelIds: channelIds.filter((channelId) => !groupedChannelIds.has(channelId)),
      collapsedGroupIds,
    };
  },

  async createChannelGroup({ communityId, name, position, createdByUserId }) {
    const { data, error } = await supabase
      .from('channel_groups')
      .insert({
        community_id: communityId,
        name,
        position,
        created_by_user_id: createdByUserId,
      })
      .select('id, community_id, name, position')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      communityId: data.community_id,
      name: data.name,
      position: data.position,
      channelIds: [],
    };
  },

  async renameChannelGroup({ communityId, groupId, name }) {
    const { error } = await supabase
      .from('channel_groups')
      .update({ name })
      .eq('community_id', communityId)
      .eq('id', groupId);
    if (error) throw error;
  },

  async deleteChannelGroup({ communityId, groupId }) {
    const { error } = await supabase
      .from('channel_groups')
      .delete()
      .eq('community_id', communityId)
      .eq('id', groupId);
    if (error) throw error;
  },

  async setChannelGroupForChannel({ communityId, channelId, groupId, position }) {
    if (!groupId) {
      const { error } = await supabase
        .from('channel_group_channels')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_group_channels')
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          group_id: groupId,
          position,
        },
        { onConflict: 'community_id,channel_id' }
      );
    if (error) throw error;
  },

  async setChannelGroupCollapsed({ communityId, groupId, isCollapsed }) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    if (!isCollapsed) {
      const { error } = await supabase
        .from('channel_group_preferences')
        .delete()
        .eq('community_id', communityId)
        .eq('group_id', groupId)
        .eq('user_id', user.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_group_preferences')
      .upsert(
        {
          community_id: communityId,
          group_id: groupId,
          user_id: user.id,
          is_collapsed: true,
        },
        { onConflict: 'community_id,group_id,user_id' }
      );
    if (error) throw error;
  },

  subscribeToChannels(communityId, onChange) {
    return supabase
      .channel(`channels:${communityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channels',
          filter: `community_id=eq.${communityId}`,
        },
        onChange
      )
      .subscribe();
  },

  async listMessages(communityId, channelId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async listMessagesPage({ communityId, channelId, beforeCursor, limit = 60 }) {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 60;

    let query = supabase
      .from('messages')
      .select('*')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .is('deleted_at', null);

    if (beforeCursor?.createdAt && beforeCursor?.id) {
      query = query.or(
        `created_at.lt.${beforeCursor.createdAt},and(created_at.eq.${beforeCursor.createdAt},id.lt.${beforeCursor.id})`
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(boundedLimit + 1);

    if (error) throw error;

    const rows = (data ?? []) as Message[];
    const hasMore = rows.length > boundedLimit;
    const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;

    return {
      messages: [...pageRows].reverse(),
      hasMore,
    };
  },

  subscribeToMessages(channelId, onChange) {
    return supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // DELETE payloads can omit non-primary-key fields unless replica identity is FULL.
          // Fall back to firing on every delete so UI never lags stale rows.
          const deletedChannelId = getRealtimeRowChannelId(payload.old);
          if (!deletedChannelId || deletedChannelId === channelId) {
            onChange(payload);
          }
        }
      )
      .subscribe();
  },

  async listMessageReactions(communityId, channelId) {
    const { data, error } = await supabase
      .from('message_reactions' as never)
      .select('id, message_id, user_id, emoji, created_at')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return mapMessageReactionRows((data ?? []) as MessageReactionRow[]);
  },

  async listMessageReactionsForMessages({ communityId, channelId, messageIds }) {
    const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
    if (uniqueMessageIds.length === 0) return [];

    const chunkSize = 200;
    const chunks: string[][] = [];
    for (let index = 0; index < uniqueMessageIds.length; index += chunkSize) {
      chunks.push(uniqueMessageIds.slice(index, index + chunkSize));
    }

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('message_reactions' as never)
          .select('id, message_id, user_id, emoji, created_at')
          .eq('community_id', communityId)
          .eq('channel_id', channelId)
          .in('message_id', chunk as never)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as MessageReactionRow[];
      })
    );

    return mapMessageReactionRows(chunkResults.flat());
  },

  subscribeToMessageReactions(channelId, onChange) {
    return supabase
      .channel(`message_reactions:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const deletedChannelId = getRealtimeRowChannelId(payload.old);
          if (!deletedChannelId || deletedChannelId === channelId) {
            onChange(payload);
          }
        }
      )
      .subscribe();
  },

  async toggleMessageReaction({ communityId, channelId, messageId, emoji }) {
    const normalizedEmoji = emoji.trim();
    if (normalizedEmoji.length === 0) {
      throw new Error('Reaction emoji is required.');
    }
    if (normalizedEmoji.length > 32) {
      throw new Error('Reaction emoji exceeds supported length.');
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { data: messageRow, error: messageError } = await supabase
      .from('messages')
      .select('id, community_id, channel_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!messageRow || messageRow.deleted_at) {
      throw new Error('Message not found.');
    }
    if (messageRow.community_id !== communityId || messageRow.channel_id !== channelId) {
      throw new Error('Message does not belong to this channel.');
    }

    const { data: existingReaction, error: existingReactionError } = await supabase
      .from('message_reactions' as never)
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', normalizedEmoji)
      .maybeSingle();
    if (existingReactionError) throw existingReactionError;

    if (existingReaction && typeof existingReaction === 'object' && 'id' in existingReaction) {
      const { error: deleteError } = await supabase
        .from('message_reactions' as never)
        .delete()
        .eq('id', (existingReaction as { id: string }).id);
      if (deleteError) throw deleteError;
      return;
    }

    const { error: insertError } = await supabase
      .from('message_reactions' as never)
      .insert({
        message_id: messageId,
        community_id: communityId,
        channel_id: channelId,
        user_id: user.id,
        emoji: normalizedEmoji,
      } as never);
    if (!insertError) return;

    // Concurrent toggles can race; treat duplicate insert as already-reacted.
    if (insertError.code === '23505') return;
    throw insertError;
  },

  async listMessageAttachments(communityId, channelId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('message_attachments' as never)
      .select(
        'id, message_id, community_id, channel_id, owner_user_id, bucket_name, object_path, original_filename, mime_type, media_kind, size_bytes, created_at, expires_at'
      )
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return await mapMessageAttachmentRowsWithSignedUrls((data ?? []) as MessageAttachmentRow[]);
  },

  async listMessageAttachmentsForMessages({ communityId, channelId, messageIds }) {
    const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
    if (uniqueMessageIds.length === 0) return [];

    const nowIso = new Date().toISOString();
    const chunkSize = 200;
    const chunks: string[][] = [];
    for (let index = 0; index < uniqueMessageIds.length; index += chunkSize) {
      chunks.push(uniqueMessageIds.slice(index, index + chunkSize));
    }

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('message_attachments' as never)
          .select(
            'id, message_id, community_id, channel_id, owner_user_id, bucket_name, object_path, original_filename, mime_type, media_kind, size_bytes, created_at, expires_at'
          )
          .eq('community_id', communityId)
          .eq('channel_id', channelId)
          .in('message_id', chunk as never)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return (data ?? []) as MessageAttachmentRow[];
      })
    );

    return await mapMessageAttachmentRowsWithSignedUrls(chunkResults.flat());
  },

  subscribeToMessageAttachments(channelId, onChange) {
    return supabase
      .channel(`message_attachments:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_attachments',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_attachments',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_attachments',
        },
        (payload) => {
          const deletedChannelId = getRealtimeRowChannelId(payload.old);
          if (!deletedChannelId || deletedChannelId === channelId) {
            onChange(payload);
          }
        }
      )
      .subscribe();
  },

  async cleanupExpiredMessageAttachments(limit = 100) {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 500)
      : 100;

    const { data, error } = await supabase.rpc(
      'cleanup_expired_message_attachments' as never,
      { p_limit: boundedLimit } as never
    );
    if (error) throw error;
    return Number(data ?? 0);
  },

  async listMessageLinkPreviews(communityId, channelId) {
    const { data, error } = await supabase
      .from('message_link_previews' as never)
      .select(
        'id, message_id, community_id, channel_id, source_url, normalized_url, status, cache_id, snapshot, embed_provider, thumbnail_bucket_name, thumbnail_object_path, created_at, updated_at'
      )
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return await mapMessageLinkPreviewRowsWithSignedUrls((data ?? []) as MessageLinkPreviewRow[]);
  },

  async listMessageLinkPreviewsForMessages({ communityId, channelId, messageIds }) {
    const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
    if (uniqueMessageIds.length === 0) return [];

    const chunkSize = 200;
    const chunks: string[][] = [];
    for (let index = 0; index < uniqueMessageIds.length; index += chunkSize) {
      chunks.push(uniqueMessageIds.slice(index, index + chunkSize));
    }

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('message_link_previews' as never)
          .select(
            'id, message_id, community_id, channel_id, source_url, normalized_url, status, cache_id, snapshot, embed_provider, thumbnail_bucket_name, thumbnail_object_path, created_at, updated_at'
          )
          .eq('community_id', communityId)
          .eq('channel_id', channelId)
          .in('message_id', chunk as never)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return (data ?? []) as MessageLinkPreviewRow[];
      })
    );

    return await mapMessageLinkPreviewRowsWithSignedUrls(chunkResults.flat());
  },

  subscribeToMessageLinkPreviews(channelId, onChange) {
    return supabase
      .channel(`message_link_previews:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_link_previews',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_link_previews',
        },
        (payload) => {
          const updatedChannelId =
            getRealtimeRowChannelId(payload.new) ?? getRealtimeRowChannelId(payload.old);
          // UPDATE payloads may omit unchanged columns (including channel_id), so fall back to
          // refreshing conservatively when we cannot determine the row's channel.
          if (!updatedChannelId || updatedChannelId === channelId) {
            onChange(payload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_link_previews',
        },
        (payload) => {
          const deletedChannelId = getRealtimeRowChannelId(payload.old);
          if (!deletedChannelId || deletedChannelId === channelId) {
            onChange(payload);
          }
        }
      )
      .subscribe();
  },

  async requestChannelLinkPreviewBackfill({ communityId, channelId, messageIds }) {
    const boundedMessageIds = messageIds.slice(0, 100);
    const requestedCount = boundedMessageIds.length;

    const hasConfirmedSession = await waitForConfirmedSupabaseSession();
    if (!hasConfirmedSession) {
      return {
        queued: 0,
        skipped: requestedCount,
        alreadyPresent: 0,
        requested: requestedCount,
      };
    }

    return await supabaseFunctionJson<{
      queued: number;
      skipped: number;
      alreadyPresent: number;
      requested: number;
    }>('link-preview-backfill', {
      communityId,
      channelId,
      messageIds: boundedMessageIds,
      limit: Math.min(Math.max(requestedCount, 1), 100),
    });
  },

  async runMessageMediaMaintenance(limit = 50) {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 200)
      : 50;

    return await supabaseFunctionJson<{
      deletedMessages: number;
      claimedDeletionJobs: number;
      deletedObjects: number;
      retryableFailures: number;
      deadLetters: number;
    }>('message-media-maintenance', {
      mode: 'authenticated-fallback',
      maxExpiredMessages: boundedLimit,
      maxDeletionJobs: boundedLimit,
    });
  },

  async fetchAuthorProfiles(authorIds) {
    if (authorIds.length === 0) return {};

    const [{ data: profiles, error: profilesError }, { data: activeStaffRows, error: staffError }] =
      await Promise.all([
        supabase.from('profiles').select('id, username, avatar_url').in('id', authorIds),
        supabase
          .from('platform_staff')
          .select('user_id, display_prefix')
          .in('user_id', authorIds)
          .eq('is_active', true),
      ]);

    if (profilesError) throw profilesError;
    if (staffError) throw staffError;

    const profileMap: Record<string, AuthorProfile> = {};
    for (const authorId of authorIds) {
      profileMap[authorId] = {
        username: authorId.substring(0, 12),
        isPlatformStaff: false,
        displayPrefix: null,
        avatarUrl: null,
      };
    }

    for (const profile of profiles ?? []) {
      profileMap[profile.id] = {
        username: profile.username,
        isPlatformStaff: false,
        displayPrefix: null,
        avatarUrl: profile.avatar_url ?? null,
      };
    }

    for (const staffRow of activeStaffRows ?? []) {
      const existing = profileMap[staffRow.user_id] ?? {
        username: staffRow.user_id.substring(0, 12),
        isPlatformStaff: false,
        displayPrefix: null,
        avatarUrl: null,
      };

      profileMap[staffRow.user_id] = {
        ...existing,
        isPlatformStaff: true,
        displayPrefix: staffRow.display_prefix ?? null,
      };
    }

    return profileMap;
  },

  async isHavenDeveloperMessagingAllowed({ communityId, channelId }) {
    const { data: developerAccess, error: developerAccessError } = await supabase
      .from('community_developer_access')
      .select('enabled, mode')
      .eq('community_id', communityId)
      .maybeSingle();

    if (developerAccessError || !developerAccess?.enabled) {
      return false;
    }

    if (developerAccess.mode === 'report_only') {
      return false;
    }

    if (developerAccess.mode === 'channel_scoped') {
      const { data: allowedChannel } = await supabase
        .from('community_developer_access_channels')
        .select('channel_id')
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .maybeSingle();

      return Boolean(allowedChannel);
    }

    return false;
  },

  async canSendInChannel(channelId) {
    const { data, error } = await supabase.rpc('can_send_in_channel', {
      p_channel_id: channelId,
    });

    if (error) throw error;
    return Boolean(data);
  },

  async fetchServerSettings(communityId) {
    const [
      { data: community, error: communityError },
      { data: communitySettings, error: communitySettingsError },
      { data: developerAccess, error: developerAccessError },
      { data: scopedChannels, error: scopedChannelsError },
    ] = await Promise.all([
      supabase
        .from('communities')
        .select('name, description')
        .eq('id', communityId)
        .maybeSingle(),
      supabase
        .from('community_settings')
        .select('allow_public_invites, require_report_reason, allow_haven_developer_access, developer_access_mode')
        .eq('community_id', communityId)
        .maybeSingle(),
      supabase
        .from('community_developer_access')
        .select('enabled, mode')
        .eq('community_id', communityId)
        .maybeSingle(),
      supabase
        .from('community_developer_access_channels')
        .select('channel_id')
        .eq('community_id', communityId),
    ]);

    if (communityError) throw communityError;
    if (communitySettingsError) throw communitySettingsError;
    if (developerAccessError) throw developerAccessError;
    if (scopedChannelsError) throw scopedChannelsError;

    const defaultMode = 'report_only' as const;

    return {
      name: community?.name ?? '',
      description: community?.description ?? null,
      allowPublicInvites: communitySettings?.allow_public_invites ?? false,
      requireReportReason: communitySettings?.require_report_reason ?? true,
      developerAccessEnabled:
        developerAccess?.enabled ?? communitySettings?.allow_haven_developer_access ?? false,
      developerAccessMode:
        developerAccess?.mode ?? communitySettings?.developer_access_mode ?? defaultMode,
      developerAccessChannelIds: (scopedChannels ?? []).map((row) => row.channel_id),
    };
  },

  async updateServerSettings({ communityId, userId, values, canManageDeveloperAccess }) {
    const { error: communityError } = await supabase
      .from('communities')
      .update({
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      })
      .eq('id', communityId);
    if (communityError) throw communityError;

    const { error: communitySettingsError } = await supabase
      .from('community_settings')
      .update({
        allow_public_invites: values.allowPublicInvites,
        require_report_reason: values.requireReportReason,
        allow_haven_developer_access: values.developerAccessEnabled,
        developer_access_mode: values.developerAccessMode,
      })
      .eq('community_id', communityId);
    if (communitySettingsError) throw communitySettingsError;

    if (!canManageDeveloperAccess) return;

    const { error: developerAccessError } = await supabase
      .from('community_developer_access')
      .update({
        enabled: values.developerAccessEnabled,
        mode: values.developerAccessMode,
        granted_by_user_id: userId,
        granted_at: values.developerAccessEnabled ? new Date().toISOString() : null,
      })
      .eq('community_id', communityId);
    if (developerAccessError) throw developerAccessError;

    const { error: clearScopedError } = await supabase
      .from('community_developer_access_channels')
      .delete()
      .eq('community_id', communityId);
    if (clearScopedError) throw clearScopedError;

    if (
      values.developerAccessEnabled &&
      values.developerAccessMode === 'channel_scoped' &&
      values.developerAccessChannelIds.length > 0
    ) {
      const scopedRows = values.developerAccessChannelIds.map((channelId) => ({
        community_id: communityId,
        channel_id: channelId,
      }));

      const { error: scopedInsertError } = await supabase
        .from('community_developer_access_channels')
        .insert(scopedRows);
      if (scopedInsertError) throw scopedInsertError;
    }
  },

  async fetchServerRoleManagement(communityId) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: memberRoles, error: memberRolesError },
      { data: permissionsCatalog, error: permissionsCatalogError },
    ] = await Promise.all([
      supabase
        .from('roles')
        .select('id, name, color, position, is_default, is_system')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),
      supabase
        .from('community_members')
        .select('id, user_id, nickname, is_owner, profiles(username, avatar_url)')
        .eq('community_id', communityId),
      supabase
        .from('member_roles')
        .select('member_id, role_id')
        .eq('community_id', communityId),
      supabase.from('permissions_catalog').select('key, description').order('key', { ascending: true }),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (memberRolesError) throw memberRolesError;
    if (permissionsCatalogError) throw permissionsCatalogError;

    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissions: Array<{ role_id: string; permission_key: string }> = [];

    if (roleIds.length > 0) {
      const { data: rolePermissionRows, error: rolePermissionsError } = await supabase
        .from('role_permissions')
        .select('role_id, permission_key')
        .in('role_id', roleIds);

      if (rolePermissionsError) throw rolePermissionsError;
      rolePermissions = rolePermissionRows ?? [];
    }

    const rolePermissionsByRoleId = new Map<string, Set<string>>();
    for (const rolePermission of rolePermissions) {
      const current = rolePermissionsByRoleId.get(rolePermission.role_id) ?? new Set<string>();
      current.add(rolePermission.permission_key);
      rolePermissionsByRoleId.set(rolePermission.role_id, current);
    }

    const memberRoleIdsByMemberId = new Map<string, string[]>();
    const memberCountByRoleId = new Map<string, number>();
    for (const memberRole of memberRoles ?? []) {
      const currentRoles = memberRoleIdsByMemberId.get(memberRole.member_id) ?? [];
      currentRoles.push(memberRole.role_id);
      memberRoleIdsByMemberId.set(memberRole.member_id, currentRoles);
      memberCountByRoleId.set(
        memberRole.role_id,
        (memberCountByRoleId.get(memberRole.role_id) ?? 0) + 1
      );
    }

    const roleRows: ServerRoleItem[] = (roles ?? [])
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        isDefault: role.is_default,
        isSystem: role.is_system,
        permissionKeys: Array.from(rolePermissionsByRoleId.get(role.id) ?? []).sort(),
        memberCount: memberCountByRoleId.get(role.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.position !== b.position) return b.position - a.position;
        return a.name.localeCompare(b.name);
      });

    const rolePositionByRoleId = new Map(roleRows.map((role) => [role.id, role.position]));

    const memberRows: ServerMemberRoleItem[] = ((members ?? []) as CommunityMemberWithProfile[])
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const displayName = member.nickname?.trim() || profile?.username || member.user_id.substring(0, 12);
        const roleIds = (memberRoleIdsByMemberId.get(member.id) ?? [])
          .slice()
          .sort(
            (leftRoleId, rightRoleId) =>
              (rolePositionByRoleId.get(rightRoleId) ?? Number.NEGATIVE_INFINITY) -
              (rolePositionByRoleId.get(leftRoleId) ?? Number.NEGATIVE_INFINITY)
          );

        return {
          memberId: member.id,
          userId: member.user_id,
          displayName,
          avatarUrl: profile?.avatar_url ?? null,
          isOwner: Boolean(member.is_owner),
          roleIds,
        };
      })
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    const permissionRows: PermissionCatalogItem[] = (permissionsCatalog ?? []).map((permission) => ({
      key: permission.key,
      description: permission.description,
    }));

    return {
      roles: roleRows,
      members: memberRows,
      permissionsCatalog: permissionRows,
    };
  },

  async createServerRole({ communityId, name, color, position }) {
    const { error } = await supabase.from('roles').insert({
      community_id: communityId,
      name,
      color,
      position,
    });

    if (error) throw error;
  },

  async updateServerRole({ communityId, roleId, name, color, position }) {
    const { error } = await supabase
      .from('roles')
      .update({
        name,
        color,
        position,
      })
      .eq('community_id', communityId)
      .eq('id', roleId);

    if (error) throw error;
  },

  async deleteServerRole({ communityId, roleId }) {
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('community_id', communityId)
      .eq('id', roleId);

    if (error) throw error;
  },

  async saveServerRolePermissions({ roleId, permissionKeys }) {
    const uniquePermissionKeys = Array.from(new Set(permissionKeys));

    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);
    if (deleteError) throw deleteError;

    if (uniquePermissionKeys.length === 0) return;

    const rowsToInsert = uniquePermissionKeys.map((permissionKey) => ({
      role_id: roleId,
      permission_key: permissionKey,
    }));

    const { error: insertError } = await supabase.from('role_permissions').insert(rowsToInsert);
    if (insertError) throw insertError;
  },

  async saveServerMemberRoles({ communityId, memberId, roleIds, assignedByUserId }) {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('member_roles')
      .select('role_id')
      .eq('community_id', communityId)
      .eq('member_id', memberId);
    if (existingRowsError) throw existingRowsError;

    const existingRoleIds = (existingRows ?? []).map((row) => row.role_id);
    const existingRoleIdSet = new Set(existingRoleIds);
    const desiredRoleIdSet = new Set(uniqueRoleIds);

    const roleIdsToDelete = existingRoleIds.filter((roleId) => !desiredRoleIdSet.has(roleId));
    const roleIdsToInsert = uniqueRoleIds.filter((roleId) => !existingRoleIdSet.has(roleId));

    if (roleIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('member_roles')
        .delete()
        .eq('community_id', communityId)
        .eq('member_id', memberId)
        .in('role_id', roleIdsToDelete);
      if (deleteError) throw deleteError;
    }

    if (roleIdsToInsert.length > 0) {
      const rowsToInsert = roleIdsToInsert.map((roleId) => ({
        community_id: communityId,
        member_id: memberId,
        role_id: roleId,
        assigned_by_user_id: assignedByUserId,
      }));

      const { error: insertError } = await supabase.from('member_roles').insert(rowsToInsert);
      if (insertError) throw insertError;
    }
  },

  async createChannel(input) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    /*if (ENABLE_CHANNEL_CREATE_DIAGNOSTICS)*/ {
      const [{ data: ownerCheck }, { data: canCreateChannels }, { data: canManageChannels }] =
        await Promise.all([
          supabase.rpc('is_community_owner', {
            p_community_id: input.communityId,
          }),
          supabase.rpc('user_has_permission', {
            p_community_id: input.communityId,
            p_permission_key: 'create_channels',
          }),
          supabase.rpc('user_has_permission', {
            p_community_id: input.communityId,
            p_permission_key: 'manage_channels',
          }),
        ]);

      console.info('[createChannel] diagnostics', {
        authUserId: user.id,
        communityId: input.communityId,
        channelName: input.name,
        channelKind: input.kind,
        channelPosition: input.position,
        isCommunityOwner: Boolean(ownerCheck),
        canCreateChannels: Boolean(canCreateChannels),
        canManageChannels: Boolean(canManageChannels),
      });
    }

    const insertPayload = {
      community_id: input.communityId,
      name: input.name,
      topic: input.topic,
      created_by_user_id: user.id,
      position: input.position,
      kind: input.kind,
    };

    const { error } = await supabase
      .from('channels')
      .insert(insertPayload);

    if (error) {
      /*if (ENABLE_CHANNEL_CREATE_DIAGNOSTICS)*/ {
        console.error('[createChannel] insert failed', {
          authUserId: user.id,
          communityId: input.communityId,
          channelName: input.name,
          channelKind: input.kind,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
      }
      throw error;
    }
    const { data: fallbackChannel, error: fallbackError } = await supabase
      .from('channels')
      .select('*')
      .eq('community_id', input.communityId)
      .eq('name', input.name)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    if (!fallbackChannel) {
      throw new Error('Channel was created but is not visible to the current user.');
    }

    return fallbackChannel;
  },

  async fetchChannelPermissions({ communityId, channelId, userId }) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: roleOverwrites, error: roleOverwritesError },
      { data: memberOverwrites, error: memberOverwritesError },
      { data: myMember, error: myMemberError },
    ] = await Promise.all([
      supabase
        .from('roles')
        .select('id, name, color, is_default, position')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),
      supabase
        .from('community_members')
        .select('id, nickname, is_owner, user_id, profiles(username)')
        .eq('community_id', communityId),
      supabase
        .from('channel_role_overwrites')
        .select('role_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),
      supabase
        .from('channel_member_overwrites')
        .select('member_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),
      supabase
        .from('community_members')
        .select('id, is_owner')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (roleOverwritesError) throw roleOverwritesError;
    if (memberOverwritesError) throw memberOverwritesError;
    if (myMemberError) throw myMemberError;

    const allMemberOptions: ChannelMemberOption[] = ((members ?? []) as CommunityMemberWithProfile[])
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const displayName = member.nickname?.trim() || profile?.username || member.user_id.substring(0, 12);

        return {
          memberId: member.id,
          displayName,
          isOwner: Boolean(member.is_owner),
        };
      })
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    const roleOverwriteMap = new Map(
      (roleOverwrites ?? []).map((overwrite) => [
        overwrite.role_id,
        {
          canView: overwrite.can_view,
          canSend: overwrite.can_send,
          canManage: overwrite.can_manage,
        },
      ])
    );

    const rolePositionById = new Map((roles ?? []).map((role) => [role.id, role.position]));
    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissionRows: Array<{ role_id: string; permission_key: string }> = [];

    if (roleIds.length > 0) {
      const { data: rolePermissionData, error: rolePermissionsError } = await supabase
        .from('role_permissions')
        .select('role_id, permission_key')
        .in('role_id', roleIds);

      if (rolePermissionsError) throw rolePermissionsError;
      rolePermissionRows = rolePermissionData ?? [];
    }

    const rolePermissionKeysByRoleId = new Map<string, Set<string>>();
    for (const row of rolePermissionRows) {
      const current = rolePermissionKeysByRoleId.get(row.role_id) ?? new Set<string>();
      current.add(row.permission_key);
      rolePermissionKeysByRoleId.set(row.role_id, current);
    }

    let canEditAllRoles = Boolean(myMember?.is_owner);
    let myHighestRolePosition = Number.NEGATIVE_INFINITY;

    if (!canEditAllRoles && myMember?.id) {
      const { data: myAssignedRoles, error: myAssignedRolesError } = await supabase
        .from('member_roles')
        .select('role_id')
        .eq('community_id', communityId)
        .eq('member_id', myMember.id);

      if (myAssignedRolesError) throw myAssignedRolesError;

      myHighestRolePosition = (myAssignedRoles ?? []).reduce((highest, roleAssignment) => {
        const rolePosition = rolePositionById.get(roleAssignment.role_id);
        if (typeof rolePosition !== 'number') return highest;
        return Math.max(highest, rolePosition);
      }, Number.NEGATIVE_INFINITY);
    }

    const roleRows: ChannelRolePermissionItem[] = (roles ?? []).map((role) => {
      const overwrite = roleOverwriteMap.get(role.id);
      const rolePermissionKeys = rolePermissionKeysByRoleId.get(role.id) ?? new Set<string>();
      return {
        roleId: role.id,
        name: role.name,
        color: role.color,
        isDefault: role.is_default,
        editable: canEditAllRoles || role.position < myHighestRolePosition,
        defaultCanView: rolePermissionKeys.has('view_channels'),
        defaultCanSend: rolePermissionKeys.has('send_messages'),
        defaultCanManage: rolePermissionKeys.has('manage_channels'),
        canView: overwrite?.canView ?? null,
        canSend: overwrite?.canSend ?? null,
        canManage: overwrite?.canManage ?? null,
      };
    });

    const memberById = new Map(allMemberOptions.map((member) => [member.memberId, member]));

    const memberRows: ChannelMemberPermissionItem[] = (memberOverwrites ?? [])
      .map((overwrite) => {
        const member = memberById.get(overwrite.member_id);
        if (!member) return null;

        return {
          memberId: member.memberId,
          displayName: member.displayName,
          isOwner: member.isOwner,
          canView: overwrite.can_view,
          canSend: overwrite.can_send,
          canManage: overwrite.can_manage,
        };
      })
      .filter((member): member is ChannelMemberPermissionItem => member !== null)
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    return {
      rolePermissions: roleRows,
      memberPermissions: memberRows,
      memberOptions: allMemberOptions,
    };
  },

  async saveRoleChannelPermissions({ communityId, channelId, roleId, permissions }) {
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await supabase
        .from('channel_role_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('role_id', roleId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_role_overwrites')
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          role_id: roleId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: 'channel_id,role_id' }
      );
    if (error) throw error;
  },

  async saveMemberChannelPermissions({ communityId, channelId, memberId, permissions }) {
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await supabase
        .from('channel_member_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('member_id', memberId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_member_overwrites')
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          member_id: memberId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: 'channel_id,member_id' }
      );
    if (error) throw error;
  },

  async updateChannel({ communityId, channelId, name, topic }) {
    const { error } = await supabase
      .from('channels')
      .update({
        name,
        topic,
      })
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async deleteChannel({ communityId, channelId }) {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async sendUserMessage({ communityId, channelId, userId, content, replyToMessageId, mediaUpload }) {
    const trimmedContent = content.trim();
    const hasMediaUpload = Boolean(mediaUpload?.file);
    if (!trimmedContent && !hasMediaUpload) {
      throw new Error('Message content or media is required.');
    }

    const uploadedMedia = await uploadMessageMediaToObjectStore({
      communityId,
      channelId,
      mediaUpload,
    });

    const nextMetadata = {
      ...(replyToMessageId && replyToMessageId.trim().length > 0
        ? { replyToMessageId: replyToMessageId.trim() }
        : {}),
      ...(uploadedMedia ? { hasAttachment: true } : {}),
    };

    const { data: createdMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        community_id: communityId,
        channel_id: channelId,
        author_type: 'user',
        author_user_id: userId,
        content: trimmedContent || MEDIA_ONLY_CONTENT_PLACEHOLDER,
        metadata: nextMetadata,
      })
      .select('*')
      .single();
    if (insertError) {
      await removeUploadedMediaObject(uploadedMedia);
      throw insertError;
    }

    if (!uploadedMedia) return;

    const { error: attachmentError } = await supabase
      .from('message_attachments' as never)
      .insert({
        message_id: createdMessage.id,
        community_id: communityId,
        channel_id: channelId,
        owner_user_id: userId,
        bucket_name: uploadedMedia.bucketName,
        object_path: uploadedMedia.objectPath,
        original_filename: uploadedMedia.originalFilename,
        mime_type: uploadedMedia.mimeType,
        media_kind: uploadedMedia.mediaKind,
        size_bytes: uploadedMedia.sizeBytes,
        expires_at: uploadedMedia.expiresAt,
      } as never);

    if (!attachmentError) return;

    await removeUploadedMediaObject(uploadedMedia);
    await supabase.from('messages').delete().eq('id', createdMessage.id);
    throw attachmentError;
  },

  async editUserMessage({ communityId, messageId, content }) {
    const { error } = await supabase
      .from('messages')
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq('community_id', communityId)
      .eq('id', messageId);
    if (error) throw error;
  },

  async deleteMessage({ communityId, messageId }) {
    // Storage objects must be removed through the Storage API, not direct SQL.
    const { data: attachmentRows, error: attachmentRowsError } = await supabase
      .from('message_attachments' as never)
      .select('bucket_name, object_path')
      .eq('community_id', communityId)
      .eq('message_id', messageId);
    if (attachmentRowsError) throw attachmentRowsError;

    const attachmentPathsByBucket = new Map<string, string[]>();
    for (const attachmentRow of (attachmentRows ?? []) as MessageAttachmentStorageRow[]) {
      const existingPaths = attachmentPathsByBucket.get(attachmentRow.bucket_name) ?? [];
      existingPaths.push(attachmentRow.object_path);
      attachmentPathsByBucket.set(attachmentRow.bucket_name, existingPaths);
    }

    for (const [bucketName, paths] of attachmentPathsByBucket.entries()) {
      if (paths.length === 0) continue;

      try {
        await messageObjectStore.removeObjects(bucketName, paths);
      } catch (removeError) {
        console.warn('Failed to remove message attachment objects before message delete:', {
          messageId,
          bucketName,
          removeError,
        });
      }
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('community_id', communityId)
      .eq('id', messageId);
    if (error) throw error;
  },

  async reportMessage({ communityId, channelId, messageId, reporterUserId, target, kind, comment }) {
    const reportTitle =
      kind === 'bug' ? 'Message Report: Bug' : 'Message Report: Content Abuse';

    const reportNotes = JSON.stringify({
      type: 'message_report',
      messageId,
      channelId,
      target,
      kind,
      comment,
    });

    const reportId = crypto.randomUUID();

    const { error: reportError } = await supabase
      .from('support_reports')
      .insert({
        id: reportId,
        community_id: communityId,
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        include_last_n_messages: null,
      });

    if (reportError) throw reportError;

    const { error: channelLinkError } = await supabase.from('support_report_channels').insert({
      report_id: reportId,
      community_id: communityId,
      channel_id: channelId,
    });
    if (channelLinkError) throw channelLinkError;

    const { error: messageLinkError } = await supabase.from('support_report_messages').insert({
      report_id: reportId,
      message_id: messageId,
    });
    if (messageLinkError) throw messageLinkError;
  },

  async postHavenDeveloperMessage({
    communityId,
    channelId,
    content,
    replyToMessageId,
    mediaUpload,
  }) {
    const trimmedContent = content.trim();
    const hasMediaUpload = Boolean(mediaUpload?.file);
    if (!trimmedContent && !hasMediaUpload) {
      throw new Error('Message content or media is required.');
    }

    const uploadedMedia = await uploadMessageMediaToObjectStore({
      communityId,
      channelId,
      mediaUpload,
    });

    const nextMetadata = {
      source: 'renderer_dev_mode',
      ...(replyToMessageId && replyToMessageId.trim().length > 0
        ? { replyToMessageId: replyToMessageId.trim() }
        : {}),
      ...(uploadedMedia ? { hasAttachment: true } : {}),
    };

    const { data: createdMessage, error } = await supabase.rpc('post_haven_dev_message', {
      p_community_id: communityId,
      p_channel_id: channelId,
      p_content: trimmedContent || MEDIA_ONLY_CONTENT_PLACEHOLDER,
      p_metadata: nextMetadata,
    });
    if (error) {
      await removeUploadedMediaObject(uploadedMedia);
      throw error;
    }

    if (!uploadedMedia) return;

    const createdMessageId =
      createdMessage && typeof createdMessage === 'object' && 'id' in createdMessage
        ? (createdMessage as { id: string }).id
        : null;

    if (!createdMessageId) {
      await removeUploadedMediaObject(uploadedMedia);
      throw new Error('Failed to create Haven developer message.');
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      await removeUploadedMediaObject(uploadedMedia);
      throw authError;
    }
    if (!user?.id) {
      await removeUploadedMediaObject(uploadedMedia);
      throw new Error('Not authenticated.');
    }

    const { error: attachmentError } = await supabase
      .from('message_attachments' as never)
      .insert({
        message_id: createdMessageId,
        community_id: communityId,
        channel_id: channelId,
        owner_user_id: user.id,
        bucket_name: uploadedMedia.bucketName,
        object_path: uploadedMedia.objectPath,
        original_filename: uploadedMedia.originalFilename,
        mime_type: uploadedMedia.mimeType,
        media_kind: uploadedMedia.mediaKind,
        size_bytes: uploadedMedia.sizeBytes,
        expires_at: uploadedMedia.expiresAt,
      } as never);

    if (!attachmentError) return;

    await removeUploadedMediaObject(uploadedMedia);
    await supabase.from('messages').delete().eq('id', createdMessageId);
    throw attachmentError;
  },
};
