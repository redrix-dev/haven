import type { HavenSupabaseClient } from '@shared/lib/createHavenSupabaseClient';
import type { Database } from '@shared/types/database';
import type { MessageObjectStore } from "./messageObjectStore";
import type { MediaAttachmentHelpers } from "./mediaAttachmentUtils";
import { createPortableUuid } from "../runtime/uuid";
import type {
  BanCommunityMemberResult,
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
  ChannelAccessRevokedResult,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
  SupportReportMessageSnapshot,
  SupportReportProfileSnapshot,
  SupportReportSnapshotMessage,
  LinkPreviewSnapshot,
  LinkPreviewStatus,
  LinkPreviewEmbedProvider,
  KickCommunityMemberResult,
  MessageBundle,
} from './types';
import type {
  CommunityDataBackend,
  MessagePageCursor,
  MessagePageResult,
} from './communityDataBackend.interface';

export type {
  CommunityDataBackend,
  MessagePageCursor,
  MessagePageResult,
} from './communityDataBackend.interface';

type CommunityMemberWithProfile = Pick<
  Database['public']['Tables']['community_members']['Row'],
  'id' | 'nickname' | 'is_owner' | 'user_id' | 'joined_at'
> & {
  profiles:
    | Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>
    | Array<Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>>
    | null;
};

let havenCommunityClient: HavenSupabaseClient | null = null;
let havenCommunityEdgeConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
let havenCommunityMedia: MediaAttachmentHelpers | null = null;
let havenCommunityObjectStore: MessageObjectStore | null = null;

export function configureCommunityDataBackendRuntime(input: {
  client: HavenSupabaseClient;
  edge: { supabaseUrl: string; supabaseAnonKey: string };
  media: MediaAttachmentHelpers;
  messageStore: MessageObjectStore;
}): void {
  havenCommunityClient = input.client;
  havenCommunityEdgeConfig = input.edge;
  havenCommunityMedia = input.media;
  havenCommunityObjectStore = input.messageStore;
}

function havenCommunitySb(): HavenSupabaseClient {
  if (!havenCommunityClient) {
    throw new Error(
      'Community data backend used before Haven data runtime was initialized.',
    );
  }
  return havenCommunityClient;
}

function havenCommunityMediaHelpers(): MediaAttachmentHelpers {
  if (!havenCommunityMedia) {
    throw new Error('Community media helpers not configured.');
  }
  return havenCommunityMedia;
}

function havenCommunityStore(): MessageObjectStore {
  if (!havenCommunityObjectStore) {
    throw new Error('Community message object store not configured.');
  }
  return havenCommunityObjectStore;
}

const MESSAGE_MEDIA_BUCKET = 'message-media';
const LINK_PREVIEW_IMAGE_BUCKET = 'link-preview-images';

const deriveMessageMediaKindFromMimeType = (mimeType: string): 'image' | 'video' | 'file' => {
  const base = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (base.startsWith('image/')) return 'image';
  if (base.startsWith('video/')) return 'video';
  return 'file';
};

const deriveMessageMediaStorageExtension = (mimeType: string, filename?: string): string => {
  const trimmedName = filename?.trim();
  if (trimmedName && trimmedName.includes('.')) {
    const ext = trimmedName.slice(trimmedName.lastIndexOf('.'));
    if (ext.length >= 2 && ext.length <= 12) {
      return ext.startsWith('.') ? ext : `.${ext}`;
    }
  }
  const base = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'application/pdf': '.pdf',
  };
  return mimeMap[base] ?? '.bin';
};

const buildMessageMediaObjectPath = (input: {
  communityId: string;
  channelId: string;
  mimeType: string;
  filename?: string;
}): string => {
  const ext = deriveMessageMediaStorageExtension(input.mimeType, input.filename);
  const stamp = Date.now();
  const random = createPortableUuid();
  return `${input.communityId}/${input.channelId}/${stamp}-${random}${ext}`;
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

type BanCommunityMemberRpcRow = {
  banned_user_id?: unknown;
  community_id?: unknown;
};

type KickCommunityMemberRpcRow = {
  kicked_user_id?: unknown;
  community_id?: unknown;
};

type ListCommunityBansRpcRow = {
  id?: unknown;
  community_id?: unknown;
  banned_user_id?: unknown;
  banned_by_user_id?: unknown;
  reason?: unknown;
  banned_at?: unknown;
  revoked_at?: unknown;
  revoked_by_user_id?: unknown;
  revoked_reason?: unknown;
  username?: unknown;
  avatar_url?: unknown;
};

type ReportProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'avatar_url'
>;

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

const getReplyToMessageId = (message: Pick<Message, 'metadata'>): string | null => {
  const metadata = asObjectRecord(message.metadata);
  const replyToMessageId = metadata?.replyToMessageId;
  return typeof replyToMessageId === 'string' && replyToMessageId.trim().length > 0
    ? replyToMessageId
    : null;
};

const compareMessagesByCreatedAt = (left: Pick<Message, 'created_at' | 'id'>, right: Pick<Message, 'created_at' | 'id'>): number => {
  const createdAtComparison = left.created_at.localeCompare(right.created_at);
  if (createdAtComparison !== 0) return createdAtComparison;
  return left.id.localeCompare(right.id);
};

const toSupportReportSnapshotMessage = (
  message: Pick<Message, 'id' | 'content' | 'author_user_id' | 'created_at'>,
  profile: ReportProfileRow | null
): SupportReportSnapshotMessage => ({
  id: message.id,
  content: message.content,
  authorUserId: message.author_user_id,
  authorUsername: profile?.username ?? null,
  avatarUrl: profile?.avatar_url ?? null,
  createdAt: message.created_at,
});

const listProfileSnapshotsByUserId = async (userIds: readonly (string | null | undefined)[]) => {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId): userId is string => typeof userId === 'string' && userId.length > 0))
  );
  if (uniqueUserIds.length === 0) {
    return new Map<string, ReportProfileRow>();
  }

  const { data, error } = await havenCommunitySb().from('profiles')
    .select('id, username, avatar_url')
    .in('id', uniqueUserIds);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, row as ReportProfileRow]));
};

const fetchSupportReportProfileSnapshot = async (
  targetUserId: string
): Promise<SupportReportProfileSnapshot> => {
  const profileByUserId = await listProfileSnapshotsByUserId([targetUserId]);
  const profile = profileByUserId.get(targetUserId) ?? null;

  return {
    targetUserId,
    targetUsername: profile?.username ?? null,
    targetAvatarUrl: profile?.avatar_url ?? null,
    capturedAt: new Date().toISOString(),
  };
};

const fetchSupportReportMessageSnapshot = async (input: {
  communityId: string;
  channelId: string;
  messageId: string;
}): Promise<SupportReportMessageSnapshot | null> => {
  const { data: reportedMessage, error: reportedMessageError } = await havenCommunitySb().from('messages')
    .select('*')
    .eq('community_id', input.communityId)
    .eq('channel_id', input.channelId)
    .eq('id', input.messageId)
    .is('deleted_at', null)
    .maybeSingle();
  if (reportedMessageError) throw reportedMessageError;
  if (!reportedMessage) return null;

  const replyToMessageId = getReplyToMessageId(reportedMessage);
  let orderedContextMessages: Message[] = [];

  if (replyToMessageId) {
    const { data: channelMessages, error: channelMessagesError } = await havenCommunitySb().from('messages')
      .select('*')
      .eq('community_id', input.communityId)
      .eq('channel_id', input.channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (channelMessagesError) throw channelMessagesError;

    const messages = (channelMessages ?? []) as Message[];
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const childIdsByParentId = new Map<string, string[]>();

    for (const message of messages) {
      const parentId = getReplyToMessageId(message);
      if (!parentId) continue;
      const existingChildIds = childIdsByParentId.get(parentId) ?? [];
      existingChildIds.push(message.id);
      childIdsByParentId.set(parentId, existingChildIds);
    }

    let threadRootId = reportedMessage.id;
    let currentMessage: Message | undefined = reportedMessage;
    while (currentMessage) {
      const parentId = getReplyToMessageId(currentMessage);
      if (!parentId) break;
      const parentMessage = messageById.get(parentId);
      if (!parentMessage) break;
      threadRootId = parentMessage.id;
      currentMessage = parentMessage;
    }

    const threadMessageIds = new Set<string>();
    const pendingIds = [threadRootId];
    while (pendingIds.length > 0) {
      const nextId = pendingIds.pop();
      if (!nextId || threadMessageIds.has(nextId)) continue;
      threadMessageIds.add(nextId);
      const childIds = childIdsByParentId.get(nextId) ?? [];
      for (const childId of childIds) {
        pendingIds.push(childId);
      }
    }
    threadMessageIds.add(reportedMessage.id);

    orderedContextMessages = messages
      .filter((message) => threadMessageIds.has(message.id))
      .sort(compareMessagesByCreatedAt);
  } else {
    const beforeFilter =
      `created_at.lt.${reportedMessage.created_at},` +
      `and(created_at.eq.${reportedMessage.created_at},id.lt.${reportedMessage.id})`;
    const afterFilter =
      `created_at.gt.${reportedMessage.created_at},` +
      `and(created_at.eq.${reportedMessage.created_at},id.gt.${reportedMessage.id})`;

    const [
      { data: contextBeforeRows, error: contextBeforeError },
      { data: contextAfterRows, error: contextAfterError },
    ] = await Promise.all([havenCommunitySb().from('messages')
        .select('*')
        .eq('community_id', input.communityId)
        .eq('channel_id', input.channelId)
        .is('deleted_at', null)
        .or(beforeFilter)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(5),havenCommunitySb().from('messages')
        .select('*')
        .eq('community_id', input.communityId)
        .eq('channel_id', input.channelId)
        .is('deleted_at', null)
        .or(afterFilter)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(5),
    ]);
    if (contextBeforeError) throw contextBeforeError;
    if (contextAfterError) throw contextAfterError;

    orderedContextMessages = [
      ...((contextBeforeRows ?? []) as Message[]).slice().reverse(),
      reportedMessage,
      ...((contextAfterRows ?? []) as Message[]),
    ];
  }

  const authorProfilesByUserId = await listProfileSnapshotsByUserId(
    orderedContextMessages.map((message) => message.author_user_id)
  );
  const reportedMessageIndex = orderedContextMessages.findIndex((message) => message.id === reportedMessage.id);
  const safeReportedMessageIndex = reportedMessageIndex >= 0 ? reportedMessageIndex : 0;

  return {
    reportedMessage: toSupportReportSnapshotMessage(
      reportedMessage,
      authorProfilesByUserId.get(reportedMessage.author_user_id ?? '') ?? null
    ),
    contextBefore: orderedContextMessages
      .slice(0, safeReportedMessageIndex)
      .map((message) =>
        toSupportReportSnapshotMessage(
          message,
          authorProfilesByUserId.get(message.author_user_id ?? '') ?? null
        )
      ),
    contextAfter: orderedContextMessages
      .slice(safeReportedMessageIndex + 1)
      .map((message) =>
        toSupportReportSnapshotMessage(
          message,
          authorProfilesByUserId.get(message.author_user_id ?? '') ?? null
        )
      ),
    capturedAt: new Date().toISOString(),
  };
};

const supabaseFunctionJson = async <TResponse>(functionName: string, body: unknown): Promise<TResponse> => {
  if (!havenCommunityEdgeConfig) {
    throw new Error('Supabase edge configuration missing for community backend.');
  }
  const { supabaseUrl, supabaseAnonKey } = havenCommunityEdgeConfig;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or key is missing.');
  }

  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
      error: sessionError,
    } = await havenCommunitySb().auth.getSession();
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
      const { data: refreshed, error: refreshError } = await havenCommunitySb().auth.refreshSession();
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
    } = await havenCommunitySb().auth.getSession();

    if (!sessionError && session?.access_token) {
      const { data: userData, error: userError } = await havenCommunitySb().auth.getUser(session.access_token);
      if (!userError && userData.user) {
        return true;
      }
    }

    if (!refreshAttempted) {
      refreshAttempted = true;
      try {
        const { data: refreshed, error: refreshError } = await havenCommunitySb().auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const { data: refreshedUser, error: refreshedUserError } = await havenCommunitySb().auth.getUser(
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

const mapMessageReactionRows = (rows: MessageReactionRow[]): MessageReaction[] =>
  rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
  }));

const normalizeMessageMetadata = (value: unknown): Record<string, unknown> => {
  const record = asObjectRecord(value);
  return record ?? {};
};

const normalizeReactionsFromRpc = (value: unknown): MessageReaction[] => {
  if (value == null || !Array.isArray(value)) return [];
  const out: MessageReaction[] = [];
  for (const item of value) {
    const r = asObjectRecord(item);
    if (!r) continue;
    const id = typeof r.id === 'string' ? r.id : null;
    const messageId = typeof r.message_id === 'string' ? r.message_id : null;
    const userId = typeof r.user_id === 'string' ? r.user_id : null;
    const emoji = typeof r.emoji === 'string' ? r.emoji : null;
    const createdAt = typeof r.created_at === 'string' ? r.created_at : null;
    if (!id || !messageId || !userId || !emoji || !createdAt) continue;
    out.push({ id, messageId, userId, emoji, createdAt });
  }
  return out;
};

const parseMessageAttachmentRowFromRpcJson = (value: unknown): MessageAttachmentRow | null => {
  const r = asObjectRecord(value);
  if (!r) return null;
  const id = typeof r.id === 'string' ? r.id : null;
  const message_id = typeof r.message_id === 'string' ? r.message_id : null;
  const community_id = typeof r.community_id === 'string' ? r.community_id : null;
  const channel_id = typeof r.channel_id === 'string' ? r.channel_id : null;
  const owner_user_id = typeof r.owner_user_id === 'string' ? r.owner_user_id : null;
  const bucket_name = typeof r.bucket_name === 'string' ? r.bucket_name : null;
  const object_path = typeof r.object_path === 'string' ? r.object_path : null;
  const mime_type = typeof r.mime_type === 'string' ? r.mime_type : null;
  const media_kind = r.media_kind;
  const size_bytes = typeof r.size_bytes === 'number' ? r.size_bytes : null;
  const created_at = typeof r.created_at === 'string' ? r.created_at : null;
  const expires_at = typeof r.expires_at === 'string' ? r.expires_at : null;
  if (
    !id ||
    !message_id ||
    !community_id ||
    !channel_id ||
    !owner_user_id ||
    !bucket_name ||
    !object_path ||
    !mime_type ||
    (media_kind !== 'image' && media_kind !== 'video' && media_kind !== 'file') ||
    size_bytes == null ||
    !created_at ||
    !expires_at
  ) {
    return null;
  }

  return {
    id,
    message_id,
    community_id,
    channel_id,
    owner_user_id,
    bucket_name,
    object_path,
    original_filename:
      r.original_filename === null || r.original_filename === undefined
        ? null
        : typeof r.original_filename === 'string'
          ? r.original_filename
          : null,
    mime_type,
    media_kind,
    size_bytes,
    created_at,
    expires_at,
  };
};

const parseMessageLinkPreviewRowFromRpcJson = (value: unknown): MessageLinkPreviewRow | null => {
  const r = asObjectRecord(value);
  if (!r) return null;
  const id = typeof r.id === 'string' ? r.id : null;
  const message_id = typeof r.message_id === 'string' ? r.message_id : null;
  const community_id = typeof r.community_id === 'string' ? r.community_id : null;
  const channel_id = typeof r.channel_id === 'string' ? r.channel_id : null;
  const created_at = typeof r.created_at === 'string' ? r.created_at : null;
  const updated_at = typeof r.updated_at === 'string' ? r.updated_at : null;
  const status = r.status;
  const embed_provider = r.embed_provider;
  if (
    !id ||
    !message_id ||
    !community_id ||
    !channel_id ||
    !created_at ||
    !updated_at ||
    (status !== 'pending' &&
      status !== 'ready' &&
      status !== 'unsupported' &&
      status !== 'failed') ||
    (embed_provider !== 'none' && embed_provider !== 'youtube' && embed_provider !== 'vimeo')
  ) {
    return null;
  }

  return {
    id,
    message_id,
    community_id,
    channel_id,
    source_url:
      r.source_url === null || r.source_url === undefined
        ? null
        : typeof r.source_url === 'string'
          ? r.source_url
          : null,
    normalized_url:
      r.normalized_url === null || r.normalized_url === undefined
        ? null
        : typeof r.normalized_url === 'string'
          ? r.normalized_url
          : null,
    status,
    cache_id:
      r.cache_id === null || r.cache_id === undefined
        ? null
        : typeof r.cache_id === 'string'
          ? r.cache_id
          : null,
    snapshot: r.snapshot,
    embed_provider,
    thumbnail_bucket_name:
      r.thumbnail_bucket_name === null || r.thumbnail_bucket_name === undefined
        ? null
        : typeof r.thumbnail_bucket_name === 'string'
          ? r.thumbnail_bucket_name
          : null,
    thumbnail_object_path:
      r.thumbnail_object_path === null || r.thumbnail_object_path === undefined
        ? null
        : typeof r.thumbnail_object_path === 'string'
          ? r.thumbnail_object_path
          : null,
    created_at,
    updated_at,
  };
};

const mapMessageAttachmentRowsWithSignedUrls = async (
  attachmentRows: MessageAttachmentRow[]
): Promise<MessageAttachment[]> => {
  if (attachmentRows.length === 0) return [];

  let signedUrlByBucketAndPath = new Map<string, string>();
  try {
    signedUrlByBucketAndPath = await havenCommunityMediaHelpers().createSignedUrlMap(
      attachmentRows,
      60 * 60,
    );
  } catch (signedError) {
    console.error('Failed to create signed URLs for message attachments:', signedError);
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
      const signedRowsByPath = await havenCommunityStore().createSignedUrls(bucketName, paths, 60 * 30);
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

const mapChannelMessageRpcRowsToBundles = async (
  rows: Record<string, unknown>[],
  fallbackChannelId: string,
): Promise<MessageBundle[]> => {
  const attachmentRows: MessageAttachmentRow[] = [];
  const previewRows: MessageLinkPreviewRow[] = [];

  for (const row of rows) {
    const att = parseMessageAttachmentRowFromRpcJson(row.attachment);
    if (att) attachmentRows.push(att);
    const prev = parseMessageLinkPreviewRowFromRpcJson(row.link_preview);
    if (prev) previewRows.push(prev);
  }

  const signedAttachments = await mapMessageAttachmentRowsWithSignedUrls(attachmentRows);
  const signedPreviews = await mapMessageLinkPreviewRowsWithSignedUrls(previewRows);
  const attByMessageId = new Map(signedAttachments.map((a) => [a.messageId, a]));
  const previewByMessageId = new Map(signedPreviews.map((p) => [p.messageId, p]));

  return rows.map((row) => {
    const id = asOptionalString(row.id);
    if (!id) {
      throw new Error('channel message RPC returned a row without id');
    }

    return {
      id,
      channelId: asOptionalString(row.channel_id) ?? fallbackChannelId,
      authorUserId:
        row.author_user_id === null || row.author_user_id === undefined
          ? null
          : String(row.author_user_id),
      displayName: typeof row.display_name === 'string' ? row.display_name : '',
      avatarSnapshotUrl:
        row.avatar_snapshot_url === null || row.avatar_snapshot_url === undefined
          ? null
          : asOptionalString(row.avatar_snapshot_url),
      content: typeof row.content === 'string' ? row.content : '',
      metadata: normalizeMessageMetadata(row.metadata),
      replyToMessageId:
        row.reply_to_message_id === null || row.reply_to_message_id === undefined
          ? null
          : String(row.reply_to_message_id),
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      editedAt:
        row.edited_at === null || row.edited_at === undefined
          ? null
          : typeof row.edited_at === 'string'
            ? row.edited_at
            : null,
      deletedAt:
        row.deleted_at === null || row.deleted_at === undefined
          ? null
          : typeof row.deleted_at === 'string'
            ? row.deleted_at
            : null,
      isHidden: Boolean(row.is_hidden),
      isPlatformStaff: row.is_platform_staff === true,
      reactions: normalizeReactionsFromRpc(row.reactions),
      attachment: attByMessageId.get(id) ?? null,
      linkPreview: previewByMessageId.get(id) ?? null,
    };
  });
};

export const centralCommunityDataBackend: CommunityDataBackend = {
  async getMyPermissions(communityId) {
    const allFalse: ServerPermissions & { isElevated: boolean } = {
      isOwner: false,
      canManageServer: false,
      canManageRoles: false,
      canManageMembers: false,
      canCreateChannels: false,
      canManageChannelStructure: false,
      canManageChannelPermissions: false,
      canManageMessages: false,
      canManageBans: false,
      canViewBanHidden: false,
      canCreateReports: false,
      canManageReports: false,
      canRefreshLinkPreviews: false,
      canManageInvites: false,
      isElevated: false,
    };

    const { data, error } = await havenCommunitySb().rpc(
      'get_my_community_permissions' as never,
      { p_community_id: communityId } as never,
    );

    if (error) return allFalse;

    const row = Array.isArray(data) ? data[0] : data;
    if (row == null || typeof row !== 'object') return allFalse;

    const r = row as Record<string, unknown>;
    const bool = (key: string) => Boolean(r[key]);

    return {
      isOwner: bool('is_owner'),
      canManageServer: bool('can_manage_server'),
      canManageRoles: bool('can_manage_roles'),
      canManageMembers: bool('can_manage_members'),
      canCreateChannels: bool('can_create_channels'),
      canManageChannelStructure: bool('can_manage_channel_structure'),
      canManageChannelPermissions: bool('can_manage_channel_permissions'),
      canManageMessages: bool('can_manage_messages'),
      canManageBans: bool('can_manage_bans'),
      canViewBanHidden: bool('can_view_ban_hidden'),
      canCreateReports: bool('can_create_reports'),
      canManageReports: bool('can_manage_reports'),
      canRefreshLinkPreviews: bool('can_refresh_link_previews'),
      canManageInvites: bool('can_manage_invites'),
      isElevated: bool('is_elevated'),
    };
  },

  async listCommunityMembers(communityId) {
    const { data, error } = await havenCommunitySb().from('community_members')
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

    let snapshot: SupportReportProfileSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportProfileSnapshot(targetUserId);
    } catch (snapshotError) {
      console.warn('Failed to capture support report profile snapshot:', snapshotError);
    }

    const reportId = createPortableUuid();
    const reportTitle = 'User Report: Profile';
    const reportNotes = JSON.stringify({
      type: 'user_report',
      targetUserId,
      reason: normalizedReason,
    });

    const { error } = await havenCommunitySb().from('support_reports').insert({
      id: reportId,
      community_id: communityId,
      destination: 'haven_staff',
      reporter_user_id: reporterUserId,
      title: reportTitle,
      notes: reportNotes,
      snapshot,
      include_last_n_messages: null,
    });
    if (error) throw error;
  },

  async reportPlatformUserProfile({ targetUserId, reporterUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error('Report reason is required.');
    }

    let snapshot: SupportReportProfileSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportProfileSnapshot(targetUserId);
    } catch (snapshotError) {
      console.warn('Failed to capture support report profile snapshot:', snapshotError);
    }

    const reportId = createPortableUuid();
    const reportTitle = 'User Report: Profile';
    const reportNotes = JSON.stringify({
      type: 'user_report',
      targetUserId,
      reason: normalizedReason,
    });

    const { error } = await havenCommunitySb().from('support_reports').insert({
      id: reportId,
      community_id: null,
      destination: 'haven_staff',
      reporter_user_id: reporterUserId,
      title: reportTitle,
      notes: reportNotes,
      snapshot,
      include_last_n_messages: null,
    });
    if (error) throw error;
  },

  async listCommunityBans(communityId) {
    const { data, error } = await havenCommunitySb().rpc('list_community_bans', {
      p_community_id: communityId,
    });
    if (error) throw error;

    return ((data ?? []) as ListCommunityBansRpcRow[]).flatMap((row) => {
      const id = asOptionalString(row.id);
      const returnedCommunityId = asOptionalString(row.community_id);
      const bannedUserId = asOptionalString(row.banned_user_id);
      const bannedAt = asOptionalString(row.banned_at);

      if (!id || !returnedCommunityId || !bannedUserId || !bannedAt) {
        return [];
      }

      return [
        {
          id,
          communityId: returnedCommunityId,
          bannedUserId,
          bannedByUserId: asOptionalString(row.banned_by_user_id),
          reason: asOptionalString(row.reason) ?? '',
          bannedAt,
          revokedAt: asOptionalString(row.revoked_at),
          revokedByUserId: asOptionalString(row.revoked_by_user_id),
          revokedReason: asOptionalString(row.revoked_reason),
          username: asOptionalString(row.username) ?? bannedUserId.substring(0, 12),
          avatarUrl: asOptionalString(row.avatar_url),
        } satisfies CommunityBanItem,
      ];
    });
  },

  async banCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error('Ban reason is required.');
    }

    const { data, error } = await havenCommunitySb().rpc('ban_community_member', {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
      p_reason: normalizedReason,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as BanCommunityMemberRpcRow | null;
    const bannedUserId =
      row && typeof row.banned_user_id === 'string' ? row.banned_user_id : null;
    const returnedCommunityId =
      row && typeof row.community_id === 'string' ? row.community_id : null;

    if (!bannedUserId || !returnedCommunityId) {
      throw new Error('Ban RPC returned incomplete moderation context.');
    }

    return {
      bannedUserId,
      communityId: returnedCommunityId,
    };
  },

  async kickCommunityMember({ communityId, targetUserId }) {
    const { data, error } = await havenCommunitySb().rpc('kick_community_member', {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as KickCommunityMemberRpcRow | null;
    const kickedUserId =
      row && typeof row.kicked_user_id === 'string' ? row.kicked_user_id : null;
    const returnedCommunityId =
      row && typeof row.community_id === 'string' ? row.community_id : null;

    if (!kickedUserId || !returnedCommunityId) {
      throw new Error('Kick RPC returned incomplete moderation context.');
    }

    return {
      kickedUserId,
      communityId: returnedCommunityId,
    };
  },

  async unbanCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason?.trim() ?? null;
    const { error } = await havenCommunitySb().rpc('unban_community_member', {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
      p_reason: normalizedReason && normalizedReason.length > 0 ? normalizedReason : undefined,
    });
    if (error) throw error;
  },

  async listBanEligibleServersForUser(targetUserId) {
    if (!targetUserId) return [];

    const { data, error } = await havenCommunitySb().rpc('list_bannable_shared_communities', {
      p_target_user_id: targetUserId,
    });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      communityId: row.community_id,
      communityName: row.community_name,
    }));
  },

  async listChannels(communityId) {
    const { data, error } = await havenCommunitySb().from('channels')
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
    ] = await Promise.all([havenCommunitySb().from('channel_groups')
        .select('id, community_id, name, position')
        .eq('community_id', communityId)
        .order('position', { ascending: true }),havenCommunitySb().from('channel_group_channels')
        .select('channel_id, group_id, position')
        .eq('community_id', communityId)
        .order('position', { ascending: true }),
      havenCommunitySb().auth.getUser(),
    ]);

    if (groupRowsError) throw groupRowsError;
    if (mappingRowsError) throw mappingRowsError;
    if (authResult.error) throw authResult.error;

    const currentUserId = authResult.data.user?.id ?? null;

    let collapsedGroupIds: string[] = [];
    if (currentUserId) {
      const { data: preferenceRows, error: preferenceRowsError } = await havenCommunitySb().from('channel_group_preferences')
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
    const { data, error } = await havenCommunitySb().from('channel_groups')
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
    const { error } = await havenCommunitySb().from('channel_groups')
      .update({ name })
      .eq('community_id', communityId)
      .eq('id', groupId);
    if (error) throw error;
  },

  async deleteChannelGroup({ communityId, groupId }) {
    const { error } = await havenCommunitySb().from('channel_groups')
      .delete()
      .eq('community_id', communityId)
      .eq('id', groupId);
    if (error) throw error;
  },

  async setChannelGroupForChannel({ communityId, channelId, groupId, position }) {
    if (!groupId) {
      const { error } = await havenCommunitySb().from('channel_group_channels')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb().from('channel_group_channels')
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
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    if (!isCollapsed) {
      const { error } = await havenCommunitySb().from('channel_group_preferences')
        .delete()
        .eq('community_id', communityId)
        .eq('group_id', groupId)
        .eq('user_id', user.id);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb().from('channel_group_preferences')
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

  async fetchMyMemberRoleAssignmentForRealtime(communityId, userId) {
    const { data: memberRow, error: memberErr } = await havenCommunitySb()
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!memberRow?.id) return null;

    const { data: roleRows, error: roleErr } = await havenCommunitySb()
      .from('member_roles')
      .select('role_id')
      .eq('member_id', memberRow.id)
      .eq('community_id', communityId);
    if (roleErr) throw roleErr;

    const roleIds = [
      ...new Set((roleRows ?? []).map((r) => r.role_id)),
    ];
    return { memberId: memberRow.id, roleIds };
  },

  async broadcastMemberBanned(_input) {
    // Ban RPC emits member_banned on the banned user's private_user channel.
  },

  async broadcastMemberChannelAccessRevoked({
    communityId,
    channelId,
    revokedUserId,
  }) {
    const { error } = await havenCommunitySb().rpc(
      'broadcast_member_channel_access_revoked' as never,
      {
        p_community_id: communityId,
        p_channel_id: channelId,
        p_revoked_user_id: revokedUserId,
      } as never,
    );
    if (error) throw error;
  },

  async broadcastReportStatusUpdated({
    reportId,
    status,
    communityId,
    updatedBy,
  }) {
    const { error } = await havenCommunitySb().rpc(
      'broadcast_report_status_updated' as never,
      {
        p_community_id: communityId,
        p_report_id: reportId,
        p_status: status,
        p_updated_by: updatedBy,
      } as never,
    );
    if (error) throw error;
  },

  async listMessages(communityId, channelId) {
    const { data, error } = await havenCommunitySb().from('messages')
      .select('*')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async listChannelMessages(input) {
    const { communityId, channelId, beforeCreatedAt, beforeMessageId } = input;
    const rpcLimit = input.limit ?? 50;
    const { data, error } = await havenCommunitySb().rpc('list_channel_messages' as never, {
      p_community_id: communityId,
      p_channel_id: channelId,
      p_limit: rpcLimit,
      p_before_created_at: beforeCreatedAt ?? null,
      p_before_message_id: beforeMessageId ?? null,
    } as never);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const messages = await mapChannelMessageRpcRowsToBundles(rows, input.channelId);

    return {
      messages,
      hasMore: rows.length === (input.limit ?? 50),
    };
  },

  async getChannelMessage(input) {
    const { communityId, channelId, messageId } = input;
    const { data, error } = await havenCommunitySb().rpc('get_channel_message' as never, {
      p_community_id: communityId,
      p_channel_id: channelId,
      p_message_id: messageId,
    } as never);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const messages = await mapChannelMessageRpcRowsToBundles(rows, channelId);
    return messages[0] ?? null;
  },

  async fetchMessageAuthorProfiles(input) {
    const { communityId, authorUserIds } = input;
    const uniqueIds = Array.from(
      new Set(authorUserIds.filter((id) => typeof id === 'string' && id.length > 0)),
    );
    if (uniqueIds.length === 0) return [];

    const { data, error } = await havenCommunitySb().rpc(
      'get_message_author_profiles' as never,
      {
        p_author_user_ids: uniqueIds,
        p_community_id: communityId,
      } as never,
    );
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.flatMap((row) => {
      const userId = asOptionalString(row.id);
      const username = asOptionalString(row.username);
      if (!userId || !username) return [];
      return [
        {
          userId,
          username,
          avatarUrl: asOptionalString(row.avatar_url) ?? null,
          updatedAt:
            asOptionalString(row.updated_at) ?? new Date(0).toISOString(),
        },
      ];
    });
  },

  async listMessageReactions(communityId, channelId) {
    const { data, error } = await havenCommunitySb().from('message_reactions' as never)
      .select('id, message_id, user_id, emoji, created_at')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return mapMessageReactionRows((data ?? []) as MessageReactionRow[]);
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
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { data: messageRow, error: messageError } = await havenCommunitySb().from('messages')
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

    const { data: existingReaction, error: existingReactionError } = await havenCommunitySb().from('message_reactions' as never)
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', normalizedEmoji)
      .maybeSingle();
    if (existingReactionError) throw existingReactionError;

    if (existingReaction && typeof existingReaction === 'object' && 'id' in existingReaction) {
      const { error: deleteError } = await havenCommunitySb().from('message_reactions' as never)
        .delete()
        .eq('id', (existingReaction as { id: string }).id);
      if (deleteError) throw deleteError;
      return;
    }

    const { error: insertError } = await havenCommunitySb().from('message_reactions' as never)
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
    const { data, error } = await havenCommunitySb().from('message_attachments' as never)
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

  async cleanupExpiredMessageAttachments(limit = 100) {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 500)
      : 100;

    const { data, error } = await havenCommunitySb().rpc(
      'cleanup_expired_message_attachments' as never,
      { p_limit: boundedLimit } as never
    );
    if (error) throw error;
    return Number(data ?? 0);
  },

  async listMessageLinkPreviews(communityId, channelId) {
    const { data, error } = await havenCommunitySb().from('message_link_previews' as never)
      .select(
        'id, message_id, community_id, channel_id, source_url, normalized_url, status, cache_id, snapshot, embed_provider, thumbnail_bucket_name, thumbnail_object_path, created_at, updated_at'
      )
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return await mapMessageLinkPreviewRowsWithSignedUrls((data ?? []) as MessageLinkPreviewRow[]);
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

  async isElevatedInServer(communityId) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id || !communityId) return false;

    const { data: memberRow, error: memberError } = await havenCommunitySb().from('community_members')
      .select('id, is_owner')
      .eq('community_id', communityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!memberRow) return false;
    if (memberRow.is_owner) return true;

    const { data: memberRoleRows, error: memberRoleError } = await havenCommunitySb().from('member_roles')
      .select('role_id')
      .eq('community_id', communityId)
      .eq('member_id', memberRow.id);
    if (memberRoleError) throw memberRoleError;

    const roleIds = Array.from(
      new Set(
        (memberRoleRows ?? [])
          .map((row) => row.role_id)
          .filter((roleId): roleId is string => Boolean(roleId))
      )
    );
    if (roleIds.length === 0) return false;

    const { data: roleRows, error: roleError } = await havenCommunitySb().from('roles')
      .select('name, is_system')
      .eq('community_id', communityId)
      .in('id', roleIds);
    if (roleError) throw roleError;

    return (roleRows ?? []).some(
      (role) =>
        role.is_system === true &&
        (role.name === 'Admin' || role.name === 'Moderator')
    );
  },

  async canSendInChannel(channelId) {
    const { data, error } = await havenCommunitySb().rpc('can_send_in_channel', {
      p_channel_id: channelId,
    });

    if (error) throw error;
    return Boolean(data);
  },

  async fetchServerSettings(communityId) {
    const [
      { data: community, error: communityError },
      { data: communitySettings, error: communitySettingsError },
    ] = await Promise.all([havenCommunitySb().from('communities')
        .select('name, description')
        .eq('id', communityId)
        .maybeSingle(),havenCommunitySb().from('community_settings')
        .select('allow_public_invites, require_report_reason')
        .eq('community_id', communityId)
        .maybeSingle(),
    ]);

    if (communityError) throw communityError;
    if (communitySettingsError) throw communitySettingsError;

    return {
      name: community?.name ?? '',
      description: community?.description ?? null,
      allowPublicInvites: communitySettings?.allow_public_invites ?? false,
      requireReportReason: communitySettings?.require_report_reason ?? true,
    };
  },

  async updateServerSettings({ communityId, values }) {
    const { error: communityError } = await havenCommunitySb().from('communities')
      .update({
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      })
      .eq('id', communityId);
    if (communityError) throw communityError;

    const { error: communitySettingsError } = await havenCommunitySb().from('community_settings')
      .update({
        allow_public_invites: values.allowPublicInvites,
        require_report_reason: values.requireReportReason,
      })
      .eq('community_id', communityId);
    if (communitySettingsError) throw communitySettingsError;
  },

  async fetchServerRoleManagement(communityId) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: memberRoles, error: memberRolesError },
      { data: permissionsCatalog, error: permissionsCatalogError },
    ] = await Promise.all([havenCommunitySb().from('roles')
        .select('id, name, color, position, is_default, is_system')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),havenCommunitySb().from('community_members')
        .select('id, user_id, nickname, is_owner, profiles(username, avatar_url)')
        .eq('community_id', communityId),havenCommunitySb().from('member_roles')
        .select('member_id, role_id')
        .eq('community_id', communityId),
      havenCommunitySb().from('permissions_catalog').select('key, description').order('key', { ascending: true }),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (memberRolesError) throw memberRolesError;
    if (permissionsCatalogError) throw permissionsCatalogError;

    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissions: Array<{ role_id: string; permission_key: string }> = [];

    if (roleIds.length > 0) {
      const { data: rolePermissionRows, error: rolePermissionsError } = await havenCommunitySb().from('role_permissions')
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
    const { error } = await havenCommunitySb().from('roles').insert({
      community_id: communityId,
      name,
      color,
      position,
    });

    if (error) throw error;
  },

  async updateServerRole({ communityId, roleId, name, color, position }) {
    const { error } = await havenCommunitySb().from('roles')
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
    const { error } = await havenCommunitySb().from('roles')
      .delete()
      .eq('community_id', communityId)
      .eq('id', roleId);

    if (error) throw error;
  },

  async saveServerRolePermissions({ roleId, permissionKeys }) {
    const uniquePermissionKeys = Array.from(new Set(permissionKeys));

    const { error: deleteError } = await havenCommunitySb().from('role_permissions')
      .delete()
      .eq('role_id', roleId);
    if (deleteError) throw deleteError;

    if (uniquePermissionKeys.length === 0) return;

    const rowsToInsert = uniquePermissionKeys.map((permissionKey) => ({
      role_id: roleId,
      permission_key: permissionKey,
    }));

    const { error: insertError } = await havenCommunitySb().from('role_permissions').insert(rowsToInsert);
    if (insertError) throw insertError;
  },

  async saveServerMemberRoles({ communityId, memberId, roleIds, assignedByUserId }) {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    const { data: existingRows, error: existingRowsError } = await havenCommunitySb().from('member_roles')
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
      const { error: deleteError } = await havenCommunitySb().from('member_roles')
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

      const { error: insertError } = await havenCommunitySb().from('member_roles').insert(rowsToInsert);
      if (insertError) throw insertError;
    }
  },

  async createChannel(input) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const insertPayload = {
      community_id: input.communityId,
      name: input.name,
      topic: input.topic,
      created_by_user_id: user.id,
      position: input.position,
      kind: input.kind,
    };

    const { error } = await havenCommunitySb().from('channels')
      .insert(insertPayload);

    if (error) {
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
      throw error;
    }
    const { data: fallbackChannel, error: fallbackError } = await havenCommunitySb().from('channels')
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
    ] = await Promise.all([havenCommunitySb().from('roles')
        .select('id, name, color, is_default, position')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),havenCommunitySb().from('community_members')
        .select('id, nickname, is_owner, user_id, profiles(username)')
        .eq('community_id', communityId),havenCommunitySb().from('channel_role_overwrites')
        .select('role_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),havenCommunitySb().from('channel_member_overwrites')
        .select('member_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),havenCommunitySb().from('community_members')
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
      const { data: rolePermissionData, error: rolePermissionsError } = await havenCommunitySb().from('role_permissions')
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
      const { data: myAssignedRoles, error: myAssignedRolesError } = await havenCommunitySb().from('member_roles')
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
      const { error } = await havenCommunitySb().from('channel_role_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('role_id', roleId);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb().from('channel_role_overwrites')
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
    const [
      { data: memberRow, error: memberError },
      { data: existingOverwrite, error: existingOverwriteError },
    ] = await Promise.all([havenCommunitySb().from('community_members')
        .select('user_id')
        .eq('community_id', communityId)
        .eq('id', memberId)
        .maybeSingle(),havenCommunitySb().from('channel_member_overwrites')
        .select('can_view')
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('member_id', memberId)
        .maybeSingle(),
    ]);
    if (memberError) throw memberError;
    if (existingOverwriteError) throw existingOverwriteError;

    const revokedUserId = memberRow?.user_id ?? null;
    if (!revokedUserId) {
      throw new Error('Channel member overwrite target was not found.');
    }

    const wasExplicitlyRevoked = existingOverwrite?.can_view === false;
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await havenCommunitySb().from('channel_member_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('member_id', memberId);
      if (error) throw error;
      return null;
    }

    const { error } = await havenCommunitySb().from('channel_member_overwrites')
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
    if (permissions.canView !== false || wasExplicitlyRevoked) {
      return null;
    }

    return {
      revokedUserId,
      channelId,
      communityId,
    };
  },

  async listChannelRevokedUserIds({ communityId, channelId }) {
    const { data: overwriteRows, error: overwriteError } = await havenCommunitySb().from('channel_member_overwrites')
      .select('member_id')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .eq('can_view', false);
    if (overwriteError) throw overwriteError;

    const memberIds = Array.from(
      new Set(
        (overwriteRows ?? [])
          .map((row) => row.member_id)
          .filter((memberId): memberId is string => Boolean(memberId))
      )
    );
    if (memberIds.length === 0) {
      return [] as string[];
    }

    const { data: memberRows, error: memberError } = await havenCommunitySb().from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .in('id', memberIds);
    if (memberError) throw memberError;

    return Array.from(
      new Set(
        (memberRows ?? [])
          .map((row) => row.user_id)
          .filter((userId): userId is string => Boolean(userId))
      )
    );
  },

  async updateChannel({ communityId, channelId, name, topic }) {
    const { error } = await havenCommunitySb().from('channels')
      .update({
        name,
        topic,
      })
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async deleteChannel({ communityId, channelId }) {
    const { error } = await havenCommunitySb().from('channels')
      .delete()
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async sendUserMessage({ communityId, channelId, content, replyToMessageId, metadata }) {
    const { data, error } = await havenCommunitySb().rpc('send_user_message' as never, {
      p_community_id: communityId,
      p_channel_id: channelId,
      p_content: content,
      p_reply_to_message_id: replyToMessageId ?? null,
      p_metadata: metadata ?? {},
    } as never);
    if (error) throw error;
    if (data == null || typeof data !== 'string') {
      throw new Error('send_user_message did not return a message id');
    }
    return { id: data };
  },

  async uploadMessageMedia(input) {
    const objectPath = buildMessageMediaObjectPath({
      communityId: input.communityId,
      channelId: input.channelId,
      mimeType: input.mimeType,
      filename: input.filename,
    });
    const mediaKind = deriveMessageMediaKindFromMimeType(input.mimeType);
    const sizeBytes =
      typeof Blob !== 'undefined' && input.file instanceof Blob
        ? input.file.size
        : input.file instanceof ArrayBuffer
          ? input.file.byteLength
          : (input.file as unknown as ArrayBuffer).byteLength;

    const uploadContentType = input.contentType ?? input.mimeType;
    const { error: uploadError } = await havenCommunitySb().storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(objectPath, input.file, {
        contentType: uploadContentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const expiresAt = new Date(
      Date.now() + input.expiresInHours * 60 * 60 * 1000
    ).toISOString();

    return {
      objectPath,
      mimeType: input.mimeType,
      sizeBytes,
      mediaKind,
      expiresAt,
    };
  },

  async insertMessageAttachment(input) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { error } = await havenCommunitySb().from('message_attachments' as never).insert({
      message_id: input.messageId,
      community_id: input.communityId,
      channel_id: input.channelId,
      owner_user_id: user.id,
      bucket_name: MESSAGE_MEDIA_BUCKET,
      object_path: input.objectPath,
      original_filename: input.filename ?? null,
      mime_type: input.mimeType,
      media_kind: input.mediaKind,
      size_bytes: input.sizeBytes,
      expires_at: input.expiresAt,
    } as never);
    if (error) throw error;
  },

  async editUserMessage({ communityId, messageId, content }) {
    const { error } = await havenCommunitySb().from('messages')
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq('community_id', communityId)
      .eq('id', messageId);
    if (error) throw error;
  },

  async deleteMessage(input: { communityId: string; messageId: string } | { messageId: string }) {
    if ('communityId' in input && typeof input.communityId === 'string') {
      const { communityId, messageId } = input;
      // Storage objects must be removed through the Storage API, not direct SQL.
      const { data: attachmentRows, error: attachmentRowsError } = await havenCommunitySb().from('message_attachments' as never)
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
          await havenCommunityStore().removeObjects(bucketName, paths);
        } catch (removeError) {
          console.warn('Failed to remove message attachment objects before message delete:', {
            messageId,
            bucketName,
            removeError,
          });
        }
      }

      const { error } = await havenCommunitySb().from('messages')
        .delete()
        .eq('community_id', communityId)
        .eq('id', messageId);
      if (error) throw error;
      return;
    }

    const { messageId } = input;
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { error } = await havenCommunitySb().from('messages')
      .delete()
      .eq('id', messageId)
      .eq('author_user_id', user.id);
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

    let snapshot: SupportReportMessageSnapshot | null = null;
    try {
      snapshot = await fetchSupportReportMessageSnapshot({
        communityId,
        channelId,
        messageId,
      });
    } catch (snapshotError) {
      console.warn('Failed to capture support report message snapshot:', snapshotError);
    }

    if (target === 'both') {
      // Fan-out: insert server_admins row first, then haven_staff row with source_report_id link.
      // 'both' is never stored — each side gets an independent row.
      const serverAdminsId = createPortableUuid();
      const havenStaffId = createPortableUuid();

      const { error: saError } = await havenCommunitySb().from('support_reports').insert({
        id: serverAdminsId,
        community_id: communityId,
        destination: 'server_admins',
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        snapshot,
        include_last_n_messages: null,
      });
      if (saError) throw saError;

      const { error: hsError } = await havenCommunitySb().from('support_reports').insert({
        id: havenStaffId,
        community_id: communityId,
        destination: 'haven_staff',
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        snapshot,
        include_last_n_messages: null,
        source_report_id: serverAdminsId,
      });
      if (hsError) throw hsError;

      // Link both rows to the same channel and message for context
      for (const reportId of [serverAdminsId, havenStaffId]) {
        const { error: channelLinkError } = await havenCommunitySb().from('support_report_channels').insert({
          report_id: reportId,
          community_id: communityId,
          channel_id: channelId,
        });
        if (channelLinkError) throw channelLinkError;

        const { error: messageLinkError } = await havenCommunitySb().from('support_report_messages').insert({
          report_id: reportId,
          message_id: messageId,
        });
        if (messageLinkError) throw messageLinkError;
      }
      return;
    }

    // Single destination: server_admins or haven_staff
    const reportId = createPortableUuid();

    const { error: reportError } = await havenCommunitySb().from('support_reports')
      .insert({
        id: reportId,
        community_id: communityId,
        destination: target,
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        snapshot,
        include_last_n_messages: null,
      });

    if (reportError) throw reportError;

    const { error: channelLinkError } = await havenCommunitySb().from('support_report_channels').insert({
      report_id: reportId,
      community_id: communityId,
      channel_id: channelId,
    });
    if (channelLinkError) throw channelLinkError;

    const { error: messageLinkError } = await havenCommunitySb().from('support_report_messages').insert({
      report_id: reportId,
      message_id: messageId,
    });
    if (messageLinkError) throw messageLinkError;
  },

};
