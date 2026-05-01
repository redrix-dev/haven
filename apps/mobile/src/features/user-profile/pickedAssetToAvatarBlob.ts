/**
 * Builds a Blob suitable for {@link import('@shared/lib/backend').ControlPlaneBackend.uploadAvatar}.
 *
 * **Do not use `fetch(localUri).blob()`** for picker URIs on React Native — it often returns an
 * empty Blob (0-byte uploads). Expo SDK 55+ exposes `File` from `expo-file-system`, which
 * implements `Blob` and reads `file://` / content-backed URIs via native APIs (see Expo FileSystem
 * docs: uploading via `expo/fetch` / `File` body, and avoiding fragile blob-from-fetch patterns).
 *
 * Desktop (`AccountSettingsModal`) exports a square WebP via canvas; mobile keeps the picker’s
 * encoding but matches the same API (non-empty `Blob` + accurate `type` for Supabase `contentType`).
 */
import { File as ExpoFsFile } from "expo-file-system";

export function pickedAssetToAvatarBlob(uri: string, fallbackMimeType: string): Blob {
    const file = new ExpoFsFile(uri);
    if (!file.exists) {
        throw new Error("Could not read the selected image.");
    }
    if (file.size <= 0) {
        throw new Error("The selected image file is empty.");
    }

    const hasType = typeof file.type === "string" && file.type.trim().length > 0;
    if (hasType) {
        return file;
    }

    return file.slice(0, file.size, fallbackMimeType);
}
