/**
 * Message RPC row parsers (trust boundary) and signed-URL enrichment.
 *
 * parse*FromRpcJson() validate untyped RPC JSON field-by-field (bad rows are
 * dropped). Signed URLs are batched, and their TTLs are load-bearing:
 * attachments 1h, preview thumbnails 30m. mapChannelMessageRpcRowsToBundles()
 * assembles message + media + preview into the bundles the client renders.
 */
import { havenCommunityMediaHelpers, havenCommunityStore } from "./runtime";
import { asObjectRecord, asOptionalString, asOptionalNumber } from "./rows";
import { LINK_PREVIEW_IMAGE_BUCKET } from "./messageMedia";
import type {
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  LinkPreviewSnapshot,
  LinkPreviewStatus,
  LinkPreviewEmbedProvider,
  MessageBundle,
} from "../types";

export type MessageReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type MessageAttachmentRow = {
  id: string;
  message_id: string;
  community_id: string;
  channel_id: string;
  owner_user_id: string;
  bucket_name: string;
  object_path: string;
  original_filename: string | null;
  mime_type: string;
  media_kind: "image" | "video" | "file";
  size_bytes: number;
  created_at: string;
  expires_at: string;
};

export type MessageLinkPreviewRow = {
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

type MessageLinkPreviewThumbnail = NonNullable<
  LinkPreviewSnapshot["thumbnail"]
>;

const normalizeLinkPreviewSnapshot = (
  value: unknown,
): LinkPreviewSnapshot | null => {
  const obj = asObjectRecord(value);
  if (!obj) return null;

  const thumbnailObj = asObjectRecord(obj.thumbnail);
  const embedObj = asObjectRecord(obj.embed);
  const embedProvider =
    embedObj?.provider === "youtube" || embedObj?.provider === "vimeo"
      ? embedObj.provider
      : null;

  const embed: LinkPreviewSnapshot["embed"] =
    embedObj &&
    embedProvider &&
    typeof embedObj.embedUrl === "string" &&
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

export const mapMessageReactionRows = (
  rows: MessageReactionRow[],
): MessageReaction[] =>
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
    const id = typeof r.id === "string" ? r.id : null;
    const messageId = typeof r.message_id === "string" ? r.message_id : null;
    const userId = typeof r.user_id === "string" ? r.user_id : null;
    const emoji = typeof r.emoji === "string" ? r.emoji : null;
    const createdAt = typeof r.created_at === "string" ? r.created_at : null;
    if (!id || !messageId || !userId || !emoji || !createdAt) continue;
    out.push({ id, messageId, userId, emoji, createdAt });
  }
  return out;
};

const parseMessageAttachmentRowFromRpcJson = (
  value: unknown,
): MessageAttachmentRow | null => {
  const r = asObjectRecord(value);
  if (!r) return null;
  const id = typeof r.id === "string" ? r.id : null;
  const message_id = typeof r.message_id === "string" ? r.message_id : null;
  const community_id =
    typeof r.community_id === "string" ? r.community_id : null;
  const channel_id = typeof r.channel_id === "string" ? r.channel_id : null;
  const owner_user_id =
    typeof r.owner_user_id === "string" ? r.owner_user_id : null;
  const bucket_name = typeof r.bucket_name === "string" ? r.bucket_name : null;
  const object_path = typeof r.object_path === "string" ? r.object_path : null;
  const mime_type = typeof r.mime_type === "string" ? r.mime_type : null;
  const media_kind = r.media_kind;
  const size_bytes = typeof r.size_bytes === "number" ? r.size_bytes : null;
  const created_at = typeof r.created_at === "string" ? r.created_at : null;
  const expires_at = typeof r.expires_at === "string" ? r.expires_at : null;
  if (
    !id ||
    !message_id ||
    !community_id ||
    !channel_id ||
    !owner_user_id ||
    !bucket_name ||
    !object_path ||
    !mime_type ||
    (media_kind !== "image" &&
      media_kind !== "video" &&
      media_kind !== "file") ||
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
        : typeof r.original_filename === "string"
          ? r.original_filename
          : null,
    mime_type,
    media_kind,
    size_bytes,
    created_at,
    expires_at,
  };
};

const parseMessageLinkPreviewRowFromRpcJson = (
  value: unknown,
): MessageLinkPreviewRow | null => {
  const r = asObjectRecord(value);
  if (!r) return null;
  const id = typeof r.id === "string" ? r.id : null;
  const message_id = typeof r.message_id === "string" ? r.message_id : null;
  const community_id =
    typeof r.community_id === "string" ? r.community_id : null;
  const channel_id = typeof r.channel_id === "string" ? r.channel_id : null;
  const created_at = typeof r.created_at === "string" ? r.created_at : null;
  const updated_at = typeof r.updated_at === "string" ? r.updated_at : null;
  const status = r.status;
  const embed_provider = r.embed_provider;
  if (
    !id ||
    !message_id ||
    !community_id ||
    !channel_id ||
    !created_at ||
    !updated_at ||
    (status !== "pending" &&
      status !== "ready" &&
      status !== "unsupported" &&
      status !== "failed") ||
    (embed_provider !== "none" &&
      embed_provider !== "youtube" &&
      embed_provider !== "vimeo")
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
        : typeof r.source_url === "string"
          ? r.source_url
          : null,
    normalized_url:
      r.normalized_url === null || r.normalized_url === undefined
        ? null
        : typeof r.normalized_url === "string"
          ? r.normalized_url
          : null,
    status,
    cache_id:
      r.cache_id === null || r.cache_id === undefined
        ? null
        : typeof r.cache_id === "string"
          ? r.cache_id
          : null,
    snapshot: r.snapshot,
    embed_provider,
    thumbnail_bucket_name:
      r.thumbnail_bucket_name === null || r.thumbnail_bucket_name === undefined
        ? null
        : typeof r.thumbnail_bucket_name === "string"
          ? r.thumbnail_bucket_name
          : null,
    thumbnail_object_path:
      r.thumbnail_object_path === null || r.thumbnail_object_path === undefined
        ? null
        : typeof r.thumbnail_object_path === "string"
          ? r.thumbnail_object_path
          : null,
    created_at,
    updated_at,
  };
};

export const mapMessageAttachmentRowsWithSignedUrls = async (
  attachmentRows: MessageAttachmentRow[],
): Promise<MessageAttachment[]> => {
  if (attachmentRows.length === 0) return [];

  let signedUrlByBucketAndPath = new Map<string, string>();
  try {
    signedUrlByBucketAndPath =
      await havenCommunityMediaHelpers().createSignedUrlMap(
        attachmentRows,
        60 * 60,
      );
  } catch (signedError) {
    console.error(
      "Failed to create signed URLs for message attachments:",
      signedError,
    );
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
    signedUrl:
      signedUrlByBucketAndPath.get(`${row.bucket_name}/${row.object_path}`) ??
      null,
  }));
};

export const mapMessageLinkPreviewRowsWithSignedUrls = async (
  previewRows: MessageLinkPreviewRow[],
): Promise<MessageLinkPreview[]> => {
  if (previewRows.length === 0) return [];

  const pathsByBucket = new Map<string, string[]>();
  for (const row of previewRows) {
    const snapshot = normalizeLinkPreviewSnapshot(row.snapshot);
    const bucketName =
      row.thumbnail_bucket_name ?? snapshot?.thumbnail?.bucketName ?? null;
    const objectPath =
      row.thumbnail_object_path ?? snapshot?.thumbnail?.objectPath ?? null;
    if (!bucketName || !objectPath) continue;
    if (bucketName !== LINK_PREVIEW_IMAGE_BUCKET) continue;
    const existing = pathsByBucket.get(bucketName) ?? [];
    if (!existing.includes(objectPath)) existing.push(objectPath);
    pathsByBucket.set(bucketName, existing);
  }

  const signedUrlByBucketAndPath = new Map<string, string>();
  for (const [bucketName, paths] of pathsByBucket.entries()) {
    try {
      const signedRowsByPath = await havenCommunityStore().createSignedUrls(
        bucketName,
        paths,
        60 * 30,
      );
      for (const [path, signedUrl] of Object.entries(signedRowsByPath)) {
        signedUrlByBucketAndPath.set(`${bucketName}/${path}`, signedUrl);
      }
    } catch (signedError) {
      console.warn(
        "Failed to create signed URLs for link preview thumbnails:",
        signedError,
      );
    }
  }

  return previewRows.map((row) => {
    const snapshot = normalizeLinkPreviewSnapshot(row.snapshot);
    const bucketName =
      row.thumbnail_bucket_name ?? snapshot?.thumbnail?.bucketName ?? null;
    const objectPath =
      row.thumbnail_object_path ?? snapshot?.thumbnail?.objectPath ?? null;
    const signedUrl =
      bucketName && objectPath
        ? (signedUrlByBucketAndPath.get(`${bucketName}/${objectPath}`) ?? null)
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

export const mapChannelMessageRpcRowsToBundles = async (
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

  const signedAttachments =
    await mapMessageAttachmentRowsWithSignedUrls(attachmentRows);
  const signedPreviews =
    await mapMessageLinkPreviewRowsWithSignedUrls(previewRows);
  const attByMessageId = new Map(
    signedAttachments.map((a) => [a.messageId, a]),
  );
  const previewByMessageId = new Map(
    signedPreviews.map((p) => [p.messageId, p]),
  );

  return rows.map((row) => {
    const id = asOptionalString(row.id);
    if (!id) {
      throw new Error("channel message RPC returned a row without id");
    }

    return {
      id,
      channelId: asOptionalString(row.channel_id) ?? fallbackChannelId,
      authorUserId:
        row.author_user_id === null || row.author_user_id === undefined
          ? null
          : String(row.author_user_id),
      displayName: typeof row.display_name === "string" ? row.display_name : "",
      avatarSnapshotUrl:
        row.avatar_snapshot_url === null ||
        row.avatar_snapshot_url === undefined
          ? null
          : asOptionalString(row.avatar_snapshot_url),
      content: typeof row.content === "string" ? row.content : "",
      metadata: normalizeMessageMetadata(row.metadata),
      replyToMessageId:
        row.reply_to_message_id === null ||
        row.reply_to_message_id === undefined
          ? null
          : String(row.reply_to_message_id),
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      editedAt:
        row.edited_at === null || row.edited_at === undefined
          ? null
          : typeof row.edited_at === "string"
            ? row.edited_at
            : null,
      deletedAt:
        row.deleted_at === null || row.deleted_at === undefined
          ? null
          : typeof row.deleted_at === "string"
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
