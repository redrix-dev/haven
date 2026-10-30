/**
 * Message-media storage helpers. Pure: derive the media kind, storage
 * extension and object path for an upload.
 */
import { createPortableUuid } from "../../runtime/uuid";

export const MESSAGE_MEDIA_BUCKET = "message-media";

export const LINK_PREVIEW_IMAGE_BUCKET = "link-preview-images";

export const deriveMessageMediaKindFromMimeType = (
  mimeType: string,
): "image" | "video" | "file" => {
  const base = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  return "file";
};

const deriveMessageMediaStorageExtension = (
  mimeType: string,
  filename?: string,
): string => {
  const trimmedName = filename?.trim();
  if (trimmedName && trimmedName.includes(".")) {
    const ext = trimmedName.slice(trimmedName.lastIndexOf("."));
    if (ext.length >= 2 && ext.length <= 12) {
      return ext.startsWith(".") ? ext : `.${ext}`;
    }
  }
  const base = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const mimeMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
  };
  return mimeMap[base] ?? ".bin";
};

export const buildMessageMediaObjectPath = (input: {
  communityId: string;
  channelId: string;
  mimeType: string;
  filename?: string;
}): string => {
  const ext = deriveMessageMediaStorageExtension(
    input.mimeType,
    input.filename,
  );
  const stamp = Date.now();
  const random = createPortableUuid();
  return `${input.communityId}/${input.channelId}/${stamp}-${random}${ext}`;
};
