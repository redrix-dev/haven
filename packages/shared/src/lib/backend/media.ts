/**
 * Files. DATABASE.md: "Files".
 *
 * Uploading is two steps. The database hands out a slot (`create_upload`);
 * the bytes go into storage at that slot; then the file is put to use by
 * `send_message` or `set_my_avatar`, which check it really arrived. Nobody
 * can replace or delete a stored file afterwards.
 *
 * Reading: message files are private and are read through a short-lived
 * signed link that storage only gives to someone who can see the message.
 * Avatars and link preview pictures are public.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rpc } from "./client";
import { fromStorageError } from "./havenError";
import type { MediaPurpose, MediaRecord, ProfileRecord } from "./records";

export type FileToUpload = {
  /** Anything storage accepts: a Blob, a File, an ArrayBuffer, bytes. */
  body: Blob | ArrayBuffer | Uint8Array;
  mime_type: string;
  size_bytes: number;
  filename?: string;
  width?: number;
  height?: number;
};

/** How long a signed link to a message file works. */
const SIGNED_LINK_SECONDS = 60 * 60;

export function createMediaBackend(client: HavenSupabaseClient) {
  const publicUrl = (bucket: string, path: string) =>
    client.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  const backend = {
    /**
     * Uploads a file and returns its record. Refused before any bytes move
     * when the type or size is not allowed (`file_type_not_allowed`,
     * `file_too_large`).
     */
    async uploadFile(
      purpose: MediaPurpose,
      file: FileToUpload,
    ): Promise<MediaRecord> {
      const slot = (await rpc(client, "create_upload", {
        p_purpose: purpose,
        p_mime_type: file.mime_type,
        p_size_bytes: file.size_bytes,
        p_filename: file.filename,
        p_width: file.width,
        p_height: file.height,
      })) as MediaRecord;
      const { error } = await client.storage
        .from(slot.bucket)
        .upload(slot.object_path, file.body, { contentType: file.mime_type });
      if (error) throw fromStorageError(error);
      return slot;
    },

    /** Uploads a picture and makes it the caller's avatar. */
    async setMyAvatar(file: FileToUpload): Promise<ProfileRecord> {
      const slot = await backend.uploadFile("avatar", file);
      return (await rpc(client, "set_my_avatar", {
        p_media_id: slot.id,
      })) as ProfileRecord;
    },

    async removeMyAvatar(): Promise<ProfileRecord> {
      return (await rpc(client, "set_my_avatar", {
        p_media_id: null,
      })) as ProfileRecord;
    },

    /** Signed links for message files the caller may see, keyed by file id. */
    async signedUrls(files: MediaRecord[]): Promise<Map<string, string>> {
      const links = new Map<string, string>();
      const byBucket = new Map<string, MediaRecord[]>();
      for (const file of files) {
        byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file]);
      }
      for (const [bucket, inBucket] of byBucket) {
        const { data, error } = await client.storage
          .from(bucket)
          .createSignedUrls(
            inBucket.map((file) => file.object_path),
            SIGNED_LINK_SECONDS,
          );
        if (error) throw fromStorageError(error);
        for (const [index, signed] of (data ?? []).entries()) {
          if (signed.signedUrl) links.set(inBucket[index].id, signed.signedUrl);
        }
      }
      return links;
    },

    /** Where a person's avatar is, or null when they have none. */
    avatarUrl(profile: {
      id: string;
      avatar_media_id: string | null;
    }): string | null {
      return profile.avatar_media_id
        ? publicUrl("avatars", `${profile.id}/${profile.avatar_media_id}`)
        : null;
    },

    /** Where a link preview's cached picture is. */
    previewImageUrl(imagePath: string | null): string | null {
      return imagePath ? publicUrl("previews", imagePath) : null;
    },
  };
  return backend;
}

export type MediaBackend = ReturnType<typeof createMediaBackend>;
