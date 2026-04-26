import type { MessageObjectStore } from "./messageObjectStore";
import { createPortableUuid } from "../runtime/uuid";

export type AttachmentMediaKind = "image" | "video" | "file";

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

const DEFAULT_ALLOWED_MEDIA_KINDS: AttachmentMediaKind[] = ["image", "video", "file"];

export const DEFAULT_MEDIA_EXPIRES_IN_HOURS = 24;
export const MAX_MEDIA_EXPIRES_IN_HOURS = 24 * 30;
export const MEDIA_ONLY_CONTENT_PLACEHOLDER = "\u200B";

export const sanitizeAttachmentFileName = (value: string): string => {
  const sanitized = value
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return sanitized.length > 0 ? sanitized.slice(0, 120) : "media";
};

export const resolveAttachmentMediaKind = (mimeType: string): AttachmentMediaKind => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
};

export const getSignedUrlMapKey = (bucketName: string, objectPath: string): string =>
  `${bucketName}/${objectPath}`;

export type MediaAttachmentHelpers = {
  uploadMediaToObjectStore: (input: {
    bucketName: string;
    objectPathPrefix: string;
    mediaUpload?: {
      body: Blob;
      filename?: string;
      expiresInHours?: number;
    };
    allowedMediaKinds?: AttachmentMediaKind[];
  }) => Promise<UploadedMessageMedia | null>;
  removeUploadedMediaObject: (
    uploadedMedia: Pick<UploadedMessageMedia, "bucketName" | "objectPath"> | null,
  ) => Promise<void>;
  createSignedUrlMap: (
    rows: SignedUrlRow[],
    expiresInSeconds: number,
  ) => Promise<Map<string, string>>;
};

export function createMediaAttachmentHelpers(store: MessageObjectStore): MediaAttachmentHelpers {
  const uploadMediaToObjectStore = async (input: {
    bucketName: string;
    objectPathPrefix: string;
    mediaUpload?: {
      body: Blob;
      filename?: string;
      expiresInHours?: number;
    };
    allowedMediaKinds?: AttachmentMediaKind[];
  }): Promise<UploadedMessageMedia | null> => {
    if (!input.mediaUpload?.body) return null;

    const body = input.mediaUpload.body;
    const expiresInHours = input.mediaUpload.expiresInHours ?? DEFAULT_MEDIA_EXPIRES_IN_HOURS;
    const boundedExpiresInHours = Math.min(
      Math.max(Math.floor(expiresInHours), 1),
      MAX_MEDIA_EXPIRES_IN_HOURS,
    );
    const originalFilename = sanitizeAttachmentFileName(
      input.mediaUpload.filename || "media",
    );
    const objectPath = `${input.objectPathPrefix}/${createPortableUuid()}-${originalFilename}`;
    const mimeType = body.type?.trim() || "application/octet-stream";
    const mediaKind = resolveAttachmentMediaKind(mimeType);
    const allowedMediaKinds = input.allowedMediaKinds ?? DEFAULT_ALLOWED_MEDIA_KINDS;

    if (!allowedMediaKinds.includes(mediaKind)) {
      throw new Error("Unsupported media type for this message.");
    }

    await store.uploadMessageAttachment({
      bucketName: input.bucketName,
      objectPath,
      body,
      contentType: mimeType,
      cacheControl: "3600",
    });

    return {
      bucketName: input.bucketName,
      objectPath,
      originalFilename,
      mimeType,
      mediaKind,
      sizeBytes: body.size,
      expiresAt: new Date(Date.now() + boundedExpiresInHours * 60 * 60 * 1000).toISOString(),
      expiresInHours: boundedExpiresInHours,
    };
  };

  const removeUploadedMediaObject = async (
    uploadedMedia: Pick<UploadedMessageMedia, "bucketName" | "objectPath"> | null,
  ): Promise<void> => {
    if (!uploadedMedia) return;
    try {
      await store.removeObjects(uploadedMedia.bucketName, [uploadedMedia.objectPath]);
    } catch {
      // Best-effort rollback/cleanup.
    }
  };

  const createSignedUrlMap = async (
    rows: SignedUrlRow[],
    expiresInSeconds: number,
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
      const signedRowsByPath = await store.createSignedUrls(bucketName, paths, expiresInSeconds);
      for (const [path, signedUrl] of Object.entries(signedRowsByPath)) {
        signedUrlByBucketAndPath.set(getSignedUrlMapKey(bucketName, path), signedUrl);
      }
    }

    return signedUrlByBucketAndPath;
  };

  return {
    uploadMediaToObjectStore,
    removeUploadedMediaObject,
    createSignedUrlMap,
  };
}
