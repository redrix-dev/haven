/**
 * Produces a plain JS `Blob` with real bytes for Supabase Storage uploads.
 *
 * React Native + Supabase often uploads **0-byte objects** when the body is an Expo `File`/`Blob`
 * subclass or from `fetch(fileUri).blob()` — the storage client reads the stream incorrectly.
 *
 * Preferred path (Expo): request `base64: true` from `launchImageLibraryAsync` and decode here.
 * Fallback: `expo-file-system` `File.arrayBuffer()`, then legacy `readAsStringAsync` base64.
 */
import { File as ExpoFsFile } from "expo-file-system";
import * as LegacyFs from "expo-file-system/legacy";
import { EncodingType } from "expo-file-system/legacy";

import type { PickedAvatarAsset } from "@/features/user-profile/useProfileAvatarPicker";

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

export async function loadPickedAvatarBlob(asset: PickedAvatarAsset): Promise<Blob> {
    const mime =
        asset.mimeType.trim().length > 0 ? asset.mimeType : "image/jpeg";

    if (asset.base64 && asset.base64.length > 0) {
        const bytes = base64ToUint8Array(asset.base64);
        if (bytes.byteLength === 0) {
            throw new Error("Image data was empty after decoding.");
        }
        return new Blob([bytes as BlobPart], { type: mime });
    }

    const file = new ExpoFsFile(asset.uri);
    if (!file.exists) {
        throw new Error("Could not read the selected image.");
    }
    if (file.size <= 0) {
        throw new Error("The selected image file is empty.");
    }

    const resolvedMime =
        typeof file.type === "string" && file.type.trim().length > 0 ? file.type : mime;

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > 0) {
        return new Blob([buffer], { type: resolvedMime });
    }

    const legacyB64 = await LegacyFs.readAsStringAsync(asset.uri, {
        encoding: EncodingType.Base64,
    });
    const bytes = base64ToUint8Array(legacyB64);
    if (bytes.byteLength === 0) {
        throw new Error("Could not read image bytes from the selected file.");
    }
    return new Blob([bytes as BlobPart], { type: resolvedMime });
}
