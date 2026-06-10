/**
 * Prepares an `ArrayBuffer` + MIME type for `updateUserProfile` / Supabase Storage.
 *
 * React Native (Hermes) often throws:
 * "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
 * when using `new Blob([...])`. Supabase documents uploading **`ArrayBuffer`** from decoded
 * base64 for React Native instead of Blob/File/FormData.
 */
import { File as ExpoFsFile } from "expo-file-system";
import * as LegacyFs from "expo-file-system/legacy";
import { EncodingType } from "expo-file-system/legacy";

import type { PickedAvatarAsset } from "@/features/user-profile/useProfileAvatarPicker";

export type PickedAvatarUpload = {
  body: ArrayBuffer;
  contentType: string;
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

export async function loadPickedAvatarForUpload(
  asset: PickedAvatarAsset,
): Promise<PickedAvatarUpload> {
  const contentType =
    asset.mimeType.trim().length > 0 ? asset.mimeType : "image/jpeg";

  if (asset.base64 && asset.base64.length > 0) {
    const bytes = base64ToUint8Array(asset.base64);
    if (bytes.byteLength === 0) {
      throw new Error("Image data was empty after decoding.");
    }
    return {
      body: uint8ArrayToArrayBuffer(bytes),
      contentType,
    };
  }

  const file = new ExpoFsFile(asset.uri);
  if (!file.exists) {
    throw new Error("Could not read the selected image.");
  }
  if (file.size <= 0) {
    throw new Error("The selected image file is empty.");
  }

  const resolvedContentType =
    typeof file.type === "string" && file.type.trim().length > 0
      ? file.type
      : contentType;

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 0) {
    return { body: buffer, contentType: resolvedContentType };
  }

  const legacyB64 = await LegacyFs.readAsStringAsync(asset.uri, {
    encoding: EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(legacyB64);
  if (bytes.byteLength === 0) {
    throw new Error("Could not read image bytes from the selected file.");
  }
  return {
    body: uint8ArrayToArrayBuffer(bytes),
    contentType: resolvedContentType,
  };
}
