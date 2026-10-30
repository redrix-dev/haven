/**
 * Community messages: reading channel pages (with reactions, attachments and
 * link previews folded in), reactions, link-preview backfill, and the write
 * path (send, upload, edit, delete).
 *
 * Storage blobs must be deleted through the Storage API before the row; blob
 * cleanup is best-effort (never orphans a row, tolerates an orphan blob).
 */
import {
  havenCommunitySb,
  havenCommunityStore,
  supabaseFunctionJson,
  waitForConfirmedSupabaseSession,
} from "./runtime";
import { asOptionalString } from "./rows";
import {
  MESSAGE_MEDIA_BUCKET,
  deriveMessageMediaKindFromMimeType,
  buildMessageMediaObjectPath,
} from "./messageMedia";
import { mapChannelMessageRpcRowsToBundles } from "./messageRows";
import type { MessageBundle, LiveProfileIdentity } from "../types";

export interface CommunityMessageBackend {
  listChannelMessages(input: {
    communityId: string;
    channelId: string;
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeMessageId?: string | null;
  }): Promise<{ messages: MessageBundle[]; hasMore: boolean }>;
  getChannelMessage(input: {
    communityId: string;
    channelId: string;
    messageId: string;
  }): Promise<MessageBundle | null>;
  /**
   * Batch-fetch the *live* identity (current username + avatar) for a set of
   * message authors. Community messages only carry an avatar snapshot taken at
   * send time, so this lets the client prime ProfileNexus and render current
   * avatars that self-heal when an author changes their profile.
   */
  fetchMessageAuthorProfiles(input: {
    communityId: string;
    authorUserIds: string[];
  }): Promise<LiveProfileIdentity[]>;
  toggleMessageReaction(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    emoji: string;
  }): Promise<void>;
  requestChannelLinkPreviewBackfill(input: {
    communityId: string;
    channelId: string;
    messageIds: string[];
  }): Promise<{
    queued: number;
    skipped: number;
    alreadyPresent: number;
    requested: number;
  }>;
  sendUserMessage(input: {
    communityId: string;
    channelId: string;
    content: string;
    replyToMessageId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  uploadMessageMedia(input: {
    communityId: string;
    channelId: string;
    file: Blob | ArrayBuffer;
    filename?: string;
    mimeType: string;
    expiresInHours: 1 | 24 | 168 | 720;
    contentType?: string;
  }): Promise<{
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    mediaKind: "image" | "video" | "file";
    expiresAt: string;
  }>;
  insertMessageAttachment(input: {
    messageId: string;
    communityId: string;
    channelId: string;
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    mediaKind: "image" | "video" | "file";
    filename?: string;
    expiresAt: string;
  }): Promise<void>;
  editUserMessage(input: {
    communityId: string;
    messageId: string;
    content: string;
  }): Promise<void>;
  deleteMessage(input: {
    communityId: string;
    messageId: string;
  }): Promise<void>;
}

type MessageAttachmentStorageRow = {
  bucket_name: string;
  object_path: string;
};

export const communityMessageBackend: CommunityMessageBackend = {
  async listChannelMessages(input) {
    const { communityId, channelId, beforeCreatedAt, beforeMessageId } = input;
    const rpcLimit = input.limit ?? 50;
    const { data, error } = await havenCommunitySb().rpc(
      "list_channel_messages" as never,
      {
        p_community_id: communityId,
        p_channel_id: channelId,
        p_limit: rpcLimit,
        p_before_created_at: beforeCreatedAt ?? null,
        p_before_message_id: beforeMessageId ?? null,
      } as never,
    );
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const messages = await mapChannelMessageRpcRowsToBundles(
      rows,
      input.channelId,
    );

    return {
      messages,
      hasMore: rows.length === (input.limit ?? 50),
    };
  },

  async getChannelMessage(input) {
    const { communityId, channelId, messageId } = input;
    const { data, error } = await havenCommunitySb().rpc(
      "get_channel_message" as never,
      {
        p_community_id: communityId,
        p_channel_id: channelId,
        p_message_id: messageId,
      } as never,
    );
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const messages = await mapChannelMessageRpcRowsToBundles(rows, channelId);
    return messages[0] ?? null;
  },

  async fetchMessageAuthorProfiles(input) {
    const { communityId, authorUserIds } = input;
    const uniqueIds = Array.from(
      new Set(
        authorUserIds.filter((id) => typeof id === "string" && id.length > 0),
      ),
    );
    if (uniqueIds.length === 0) return [];

    const { data, error } = await havenCommunitySb().rpc(
      "get_message_author_profiles" as never,
      {
        p_author_user_ids: uniqueIds,
        p_community_id: communityId,
      } as never,
    );
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.flatMap((row) => {
      const userId = asOptionalString(row.id);
      const username = asOptionalString(row.username);
      if (!userId || !username) return [];
      return [
        {
          userId,
          username,
          avatarUrl: asOptionalString(row.avatar_url) ?? null,
          updatedAt:
            asOptionalString(row.updated_at) ?? new Date(0).toISOString(),
        },
      ];
    });
  },

  async toggleMessageReaction({ communityId, channelId, messageId, emoji }) {
    const normalizedEmoji = emoji.trim();
    if (normalizedEmoji.length === 0) {
      throw new Error("Reaction emoji is required.");
    }
    if (normalizedEmoji.length > 32) {
      throw new Error("Reaction emoji exceeds supported length.");
    }

    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error("Not authenticated.");

    const { data: messageRow, error: messageError } = await havenCommunitySb()
      .from("messages")
      .select("id, community_id, channel_id, deleted_at")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!messageRow || messageRow.deleted_at) {
      throw new Error("Message not found.");
    }
    if (
      messageRow.community_id !== communityId ||
      messageRow.channel_id !== channelId
    ) {
      throw new Error("Message does not belong to this channel.");
    }

    const { data: existingReaction, error: existingReactionError } =
      await havenCommunitySb()
        .from("message_reactions" as never)
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", normalizedEmoji)
        .maybeSingle();
    if (existingReactionError) throw existingReactionError;

    if (
      existingReaction &&
      typeof existingReaction === "object" &&
      "id" in existingReaction
    ) {
      const { error: deleteError } = await havenCommunitySb()
        .from("message_reactions" as never)
        .delete()
        .eq("id", (existingReaction as { id: string }).id);
      if (deleteError) throw deleteError;
      return;
    }

    const { error: insertError } = await havenCommunitySb()
      .from("message_reactions" as never)
      .insert({
        message_id: messageId,
        community_id: communityId,
        channel_id: channelId,
        user_id: user.id,
        emoji: normalizedEmoji,
      } as never);
    if (!insertError) return;

    // Concurrent toggles can race; treat duplicate insert as already-reacted.
    if (insertError.code === "23505") return;
    throw insertError;
  },

  async requestChannelLinkPreviewBackfill({
    communityId,
    channelId,
    messageIds,
  }) {
    const boundedMessageIds = messageIds.slice(0, 100);
    const requestedCount = boundedMessageIds.length;

    const hasConfirmedSession = await waitForConfirmedSupabaseSession();
    if (!hasConfirmedSession) {
      return {
        queued: 0,
        skipped: requestedCount,
        alreadyPresent: 0,
        requested: requestedCount,
      };
    }

    return await supabaseFunctionJson<{
      queued: number;
      skipped: number;
      alreadyPresent: number;
      requested: number;
    }>("link-preview-backfill", {
      communityId,
      channelId,
      messageIds: boundedMessageIds,
      limit: Math.min(Math.max(requestedCount, 1), 100),
    });
  },

  async sendUserMessage({
    communityId,
    channelId,
    content,
    replyToMessageId,
    metadata,
  }) {
    const { data, error } = await havenCommunitySb().rpc(
      "send_user_message" as never,
      {
        p_community_id: communityId,
        p_channel_id: channelId,
        p_content: content,
        p_reply_to_message_id: replyToMessageId ?? null,
        p_metadata: metadata ?? {},
      } as never,
    );
    if (error) throw error;
    if (data == null || typeof data !== "string") {
      throw new Error("send_user_message did not return a message id");
    }
    return { id: data };
  },

  async uploadMessageMedia(input) {
    const objectPath = buildMessageMediaObjectPath({
      communityId: input.communityId,
      channelId: input.channelId,
      mimeType: input.mimeType,
      filename: input.filename,
    });
    const mediaKind = deriveMessageMediaKindFromMimeType(input.mimeType);
    const sizeBytes =
      typeof Blob !== "undefined" && input.file instanceof Blob
        ? input.file.size
        : input.file instanceof ArrayBuffer
          ? input.file.byteLength
          : (input.file as unknown as ArrayBuffer).byteLength;

    const uploadContentType = input.contentType ?? input.mimeType;
    const { error: uploadError } = await havenCommunitySb()
      .storage.from(MESSAGE_MEDIA_BUCKET)
      .upload(objectPath, input.file, {
        contentType: uploadContentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const expiresAt = new Date(
      Date.now() + input.expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    return {
      objectPath,
      mimeType: input.mimeType,
      sizeBytes,
      mediaKind,
      expiresAt,
    };
  },

  async insertMessageAttachment(input) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error("Not authenticated.");

    const { error } = await havenCommunitySb()
      .from("message_attachments" as never)
      .insert({
        message_id: input.messageId,
        community_id: input.communityId,
        channel_id: input.channelId,
        owner_user_id: user.id,
        bucket_name: MESSAGE_MEDIA_BUCKET,
        object_path: input.objectPath,
        original_filename: input.filename ?? null,
        mime_type: input.mimeType,
        media_kind: input.mediaKind,
        size_bytes: input.sizeBytes,
        expires_at: input.expiresAt,
      } as never);
    if (error) throw error;
  },

  async editUserMessage({ communityId, messageId, content }) {
    const { error } = await havenCommunitySb()
      .from("messages")
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq("community_id", communityId)
      .eq("id", messageId);
    if (error) throw error;
  },

  async deleteMessage({ communityId, messageId }) {
    // Storage objects must be removed through the Storage API, not direct SQL.
    const { data: attachmentRows, error: attachmentRowsError } =
      await havenCommunitySb()
        .from("message_attachments" as never)
        .select("bucket_name, object_path")
        .eq("community_id", communityId)
        .eq("message_id", messageId);
    if (attachmentRowsError) throw attachmentRowsError;

    const attachmentPathsByBucket = new Map<string, string[]>();
    for (const attachmentRow of (attachmentRows ??
      []) as MessageAttachmentStorageRow[]) {
      const existingPaths =
        attachmentPathsByBucket.get(attachmentRow.bucket_name) ?? [];
      existingPaths.push(attachmentRow.object_path);
      attachmentPathsByBucket.set(attachmentRow.bucket_name, existingPaths);
    }

    for (const [bucketName, paths] of attachmentPathsByBucket.entries()) {
      if (paths.length === 0) continue;

      try {
        await havenCommunityStore().removeObjects(bucketName, paths);
      } catch (removeError) {
        console.warn(
          "Failed to remove message attachment objects before message delete:",
          {
            messageId,
            bucketName,
            removeError,
          },
        );
      }
    }

    const { error } = await havenCommunitySb()
      .from("messages")
      .delete()
      .eq("community_id", communityId)
      .eq("id", messageId);
    if (error) throw error;
  },
};
