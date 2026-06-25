/**
 * Reads picked library media into an ArrayBuffer + MIME type for community message upload.
 * Avoids `fetch(uri).blob()` / `Blob` construction issues on React Native Hermes (see profile avatar path).
 * Uses `expo-file-system` `File.arrayBuffer()` for images and videos without embedding base64 from the picker.
 */
import { File as ExpoFsFile } from "expo-file-system";
import * as LegacyFs from "expo-file-system/legacy";
import { EncodingType } from "expo-file-system/legacy";
import type * as ImagePicker from "expo-image-picker";

export const COMMUNITY_MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type CommunityMediaUploadPayload = {
  body: ArrayBuffer;
  contentType: string;
  fileName: string;
  localUri: string;
};

function base64ToUint8Array(b64: string): Uint8Array {
  const withoutPrefix = b64.includes(",") ? (b64.split(",").pop() ?? "") : b64;
  const normalized = withoutPrefix.replace(/\s/g, "");
  const binary = globalThis.atob(normalized);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export function resolveCommunityMediaMimeType(
  asset: ImagePicker.ImagePickerAsset,
): string {
  if (asset.mimeType?.trim()) return asset.mimeType;
  if (asset.type === "video") return "video/mp4";
  return "image/jpeg";
}

function throwTooLarge(): never {
  throw new Error(
    `This file is too large. Maximum size is ${COMMUNITY_MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
  );
}

export async function loadPickedCommunityMediaForUpload(
  asset: ImagePicker.ImagePickerAsset,
): Promise<CommunityMediaUploadPayload> {
  const contentType = resolveCommunityMediaMimeType(asset);
  const fileName = asset.fileName?.trim() || `upload-${Date.now()}`;

  const reported = asset.fileSize;
  if (
    typeof reported === "number" &&
    Number.isFinite(reported) &&
    reported > COMMUNITY_MEDIA_UPLOAD_MAX_BYTES
  ) {
    throwTooLarge();
  }

  const file = new ExpoFsFile(asset.uri);
  if (!file.exists) {
    throw new Error("Could not read the selected file.");
  }

  if (
    typeof file.size === "number" &&
    file.size > COMMUNITY_MEDIA_UPLOAD_MAX_BYTES
  ) {
    throwTooLarge();
  }
  if (typeof file.size === "number" && file.size <= 0) {
    throw new Error("The selected file is empty.");
  }

  const resolvedContentType =
    typeof file.type === "string" && file.type.trim().length > 0
      ? file.type
      : contentType;

  let buffer = await file.arrayBuffer();
  if (buffer.byteLength > COMMUNITY_MEDIA_UPLOAD_MAX_BYTES) {
    throwTooLarge();
  }
  if (buffer.byteLength > 0) {
    return {
      body: buffer,
      contentType: resolvedContentType,
      fileName,
      localUri: asset.uri,
    };
  }

  const legacyB64 = await LegacyFs.readAsStringAsync(asset.uri, {
    encoding: EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(legacyB64);
  if (bytes.byteLength > COMMUNITY_MEDIA_UPLOAD_MAX_BYTES) {
    throwTooLarge();
  }
  if (bytes.byteLength === 0) {
    throw new Error("Could not read bytes from the selected file.");
  }
  return {
    body: uint8ArrayToArrayBuffer(bytes),
    contentType: resolvedContentType,
    fileName,
    localUri: asset.uri,
  };
}
