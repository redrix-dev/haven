import { createSignedUrlMap, getSignedUrlMapKey } from './mediaAttachmentUtils';
import type { DirectMessageAttachment } from './types';

export type DirectMessageAttachmentRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  owner_user_id: string;
  bucket_name: string;
  object_path: string;
  original_filename: string | null;
  mime_type: string;
  media_kind: 'image';
  size_bytes: number;
  created_at: string;
  expires_at: string;
};

const asObjectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asRequiredString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const asOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDirectMessageAttachmentRow = (value: unknown): DirectMessageAttachmentRow | null => {
  const obj = asObjectRecord(value);
  if (!obj) return null;

  const id = asRequiredString(obj.id);
  const messageId = asRequiredString(obj.message_id ?? obj.messageId);
  const conversationId = asRequiredString(obj.conversation_id ?? obj.conversationId);
  const ownerUserId = asRequiredString(obj.owner_user_id ?? obj.ownerUserId);
  const bucketName = asRequiredString(obj.bucket_name ?? obj.bucketName);
  const objectPath = asRequiredString(obj.object_path ?? obj.objectPath);
  const mimeType = asRequiredString(obj.mime_type ?? obj.mimeType);
  const mediaKind = obj.media_kind ?? obj.mediaKind;
  const sizeBytes = asFiniteNumber(obj.size_bytes ?? obj.sizeBytes);
  const createdAt = asRequiredString(obj.created_at ?? obj.createdAt);
  const expiresAt = asRequiredString(obj.expires_at ?? obj.expiresAt);

  if (
    !id ||
    !messageId ||
    !conversationId ||
    !ownerUserId ||
    !bucketName ||
    !objectPath ||
    !mimeType ||
    mediaKind !== 'image' ||
    sizeBytes === null ||
    !createdAt ||
    !expiresAt
  ) {
    return null;
  }

  return {
    id,
    message_id: messageId,
    conversation_id: conversationId,
    owner_user_id: ownerUserId,
    bucket_name: bucketName,
    object_path: objectPath,
    original_filename: asOptionalString(obj.original_filename ?? obj.originalFilename),
    mime_type: mimeType,
    media_kind: 'image',
    size_bytes: sizeBytes,
    created_at: createdAt,
    expires_at: expiresAt,
  };
};

export const parseDirectMessageAttachmentRows = (value: unknown): DirectMessageAttachmentRow[] => {
  if (!Array.isArray(value)) return [];

  const rows: DirectMessageAttachmentRow[] = [];
  for (const item of value) {
    const row = parseDirectMessageAttachmentRow(item);
    if (row) rows.push(row);
  }
  return rows;
};

export const mapDirectMessageAttachmentRowsWithSignedUrls = async (
  attachmentRows: DirectMessageAttachmentRow[]
): Promise<DirectMessageAttachment[]> => {
  if (attachmentRows.length === 0) return [];

  let signedUrlByBucketAndPath = new Map<string, string>();
  try {
    signedUrlByBucketAndPath = await createSignedUrlMap(attachmentRows, 60 * 60);
  } catch (signedError) {
    console.error('Failed to create signed URLs for DM attachments:', signedError);
  }

  return attachmentRows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
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
      signedUrlByBucketAndPath.get(getSignedUrlMapKey(row.bucket_name, row.object_path)) ?? null,
  }));
};
