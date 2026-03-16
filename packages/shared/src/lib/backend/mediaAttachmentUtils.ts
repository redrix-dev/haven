import { messageObjectStore } from './messageObjectStore';

export type AttachmentMediaKind = 'image' | 'video' | 'file';

export type UploadedMessageMedia = {
  bucketName: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  mediaKind: AttachmentMediaKind;
  sizeBytes: number;
  expiresAt: string;
  expiresInHours: number;
};

type SignedUrlRow = {
  bucket_name: string;
  object_path: string;
};

const DEFAULT_ALLOWED_MEDIA_KINDS: AttachmentMediaKind[] = ['image', 'video', 'file'];

export const DEFAULT_MEDIA_EXPIRES_IN_HOURS = 24;
export const MAX_MEDIA_EXPIRES_IN_HOURS = 24 * 30;
export const MEDIA_ONLY_CONTENT_PLACEHOLDER = '\u200B';

export const sanitizeAttachmentFileName = (value: string): string => {
  const sanitized = value
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  return sanitized.length > 0 ? sanitized.slice(0, 120) : 'media';
};

export const resolveAttachmentMediaKind = (mimeType: string): AttachmentMediaKind => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
};

export const getSignedUrlMapKey = (bucketName: string, objectPath: string): string => `${bucketName}/${objectPath}`;

export const uploadMediaToObjectStore = async (input: {
  bucketName: string;
  objectPathPrefix: string;
  mediaUpload?: {
    file: File;
    expiresInHours?: number;
  };
  allowedMediaKinds?: AttachmentMediaKind[];
}): Promise<UploadedMessageMedia | null> => {
  if (!input.mediaUpload?.file) return null;

  const nextFile = input.mediaUpload.file;
  const expiresInHours = input.mediaUpload.expiresInHours ?? DEFAULT_MEDIA_EXPIRES_IN_HOURS;
  const boundedExpiresInHours = Math.min(
    Math.max(Math.floor(expiresInHours), 1),
    MAX_MEDIA_EXPIRES_IN_HOURS
  );
  const originalFilename = sanitizeAttachmentFileName(nextFile.name || 'media');
  const objectPath = `${input.objectPathPrefix}/${crypto.randomUUID()}-${originalFilename}`;
  const mimeType = nextFile.type?.trim() || 'application/octet-stream';
  const mediaKind = resolveAttachmentMediaKind(mimeType);
  const allowedMediaKinds = input.allowedMediaKinds ?? DEFAULT_ALLOWED_MEDIA_KINDS;

  if (!allowedMediaKinds.includes(mediaKind)) {
    throw new Error('Unsupported media type for this message.');
  }

  await messageObjectStore.uploadMessageAttachment({
    bucketName: input.bucketName,
    objectPath,
    file: nextFile,
    contentType: mimeType,
    cacheControl: '3600',
  });

  return {
    bucketName: input.bucketName,
    objectPath,
    originalFilename,
    mimeType,
    mediaKind,
    sizeBytes: nextFile.size,
    expiresAt: new Date(Date.now() + boundedExpiresInHours * 60 * 60 * 1000).toISOString(),
    expiresInHours: boundedExpiresInHours,
  };
};

export const removeUploadedMediaObject = async (
  uploadedMedia: Pick<UploadedMessageMedia, 'bucketName' | 'objectPath'> | null
): Promise<void> => {
  if (!uploadedMedia) return;
  try {
    await messageObjectStore.removeObjects(uploadedMedia.bucketName, [uploadedMedia.objectPath]);
  } catch {
    // Best-effort rollback/cleanup.
  }
};

export const createSignedUrlMap = async (
  rows: SignedUrlRow[],
  expiresInSeconds: number
): Promise<Map<string, string>> => {
  if (rows.length === 0) return new Map<string, string>();

  const pathsByBucket = new Map<string, string[]>();
  for (const row of rows) {
    const existingPaths = pathsByBucket.get(row.bucket_name) ?? [];
    existingPaths.push(row.object_path);
    pathsByBucket.set(row.bucket_name, existingPaths);
  }

  const signedUrlByBucketAndPath = new Map<string, string>();
  for (const [bucketName, paths] of pathsByBucket.entries()) {
    const signedRowsByPath = await messageObjectStore.createSignedUrls(bucketName, paths, expiresInSeconds);
    for (const [path, signedUrl] of Object.entries(signedRowsByPath)) {
      signedUrlByBucketAndPath.set(getSignedUrlMapKey(bucketName, path), signedUrl);
    }
  }

  return signedUrlByBucketAndPath;
};
