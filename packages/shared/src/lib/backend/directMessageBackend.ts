import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type { MediaAttachmentHelpers } from "./mediaAttachmentUtils";
import {
  mapDirectMessageAttachmentRowsWithSignedUrls,
  parseDirectMessageAttachmentRows,
} from "./directMessageAttachmentUtils";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from "./types";

export interface DirectMessageBackend {
  listConversations(): Promise<DirectMessageConversationSummary[]>;
  getOrCreateDirectConversation(otherUserId: string): Promise<string>;
  listMessages(input: {
    conversationId: string;
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeMessageId?: string | null;
  }): Promise<DirectMessage[]>;
  getMessage(input: {
    conversationId: string;
    messageId: string;
  }): Promise<DirectMessage | null>;
  sendMessage(input: {
    conversationId: string;
    content: string;
    metadata?: Record<string, unknown>;
    imageUpload?: {
      body: Blob | ArrayBuffer;
      filename?: string;
      expiresInHours?: number;
      /** Required when `body` is an `ArrayBuffer` (e.g. React Native Hermes). */
      contentType?: string;
    };
  }): Promise<DirectMessage>;
  markConversationRead(conversationId: string): Promise<boolean>;
  setConversationMuted(input: { conversationId: string; muted: boolean }): Promise<boolean>;
  reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string>;
}

type DirectMessageConversationRow = {
  conversation_id: string;
  kind: "direct" | "group";
  other_user_id: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_id: string | null;
  last_message_author_user_id: string | null;
  last_message_preview: string | null;
  last_message_created_at: string | null;
  unread_count: number | null;
  is_muted: boolean | null;
  muted_until: string | null;
};

type DirectMessageRow = {
  message_id: string;
  conversation_id: string;
  author_user_id: string;
  author_username: string;
  author_avatar_url: string | null;
  content: string;
  metadata: unknown;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapConversation = (row: DirectMessageConversationRow): DirectMessageConversationSummary => ({
  conversationId: row.conversation_id,
  kind: row.kind,
  otherUserId: row.other_user_id ?? null,
  otherUsername: row.other_username ?? null,
  otherAvatarUrl: row.other_avatar_url ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastMessageAt: row.last_message_at ?? null,
  lastMessageId: row.last_message_id ?? null,
  lastMessageAuthorUserId: row.last_message_author_user_id ?? null,
  lastMessagePreview: row.last_message_preview ?? null,
  lastMessageCreatedAt: row.last_message_created_at ?? null,
  unreadCount: Number(row.unread_count ?? 0),
  isMuted: Boolean(row.is_muted),
  mutedUntil: row.muted_until ?? null,
});

export function createDirectMessageBackend(
  client: HavenSupabaseClient,
  media: MediaAttachmentHelpers,
): DirectMessageBackend {
  const mapMessages = async (rows: DirectMessageRow[]): Promise<DirectMessage[]> => {
    const allAttachmentRows = rows.flatMap((row) => parseDirectMessageAttachmentRows(row.attachments));
    const signedAttachments = await mapDirectMessageAttachmentRowsWithSignedUrls(
      allAttachmentRows,
      media.createSignedUrlMap,
    );
    const attachmentsByMessageId = new Map<string, DirectMessage["attachments"]>();

    for (const attachment of signedAttachments) {
      const existing = attachmentsByMessageId.get(attachment.messageId) ?? [];
      existing.push(attachment);
      attachmentsByMessageId.set(attachment.messageId, existing);
    }

    return rows.map((row) => ({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      authorUserId: row.author_user_id,
      authorUsername: row.author_username,
      authorAvatarUrl: row.author_avatar_url ?? null,
      content: row.content,
      metadata: asRecord(row.metadata),
      createdAt: row.created_at,
      editedAt: row.edited_at ?? null,
      deletedAt: row.deleted_at ?? null,
      attachments: attachmentsByMessageId.get(row.message_id) ?? [],
    }));
  };

  const callBooleanRpc = async (functionName: string, args: Record<string, unknown>): Promise<boolean> => {
    const { data, error } = await client.rpc(functionName as never, args as never);
    if (error) throw error;
    return Boolean(data);
  };

  return {
    async listConversations() {
      const { data, error } = await client.rpc("list_my_dm_conversations" as never);
      if (error) throw error;
      return ((data ?? []) as DirectMessageConversationRow[]).map(mapConversation);
    },

    async getOrCreateDirectConversation(otherUserId) {
      const { data, error } = await client.rpc(
        "get_or_create_direct_dm_conversation" as never,
        { p_other_user_id: otherUserId } as never,
      );
      if (error) throw error;
      const value = data as unknown;
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("DM conversation creation returned no id.");
      }
      return value;
    },

    async listMessages(input) {
      const { data, error } = await client.rpc(
        "list_dm_messages" as never,
        {
          p_conversation_id: input.conversationId,
          p_limit: input.limit ?? 50,
          p_before_created_at: input.beforeCreatedAt ?? undefined,
          p_before_message_id: input.beforeMessageId ?? undefined,
        } as never,
      );
      if (error) throw error;
      return await mapMessages((data ?? []) as DirectMessageRow[]);
    },

    async getMessage(input) {
      const { data, error } = await client.rpc(
        "get_dm_message" as never,
        {
          p_conversation_id: input.conversationId,
          p_message_id: input.messageId,
        } as never,
      );
      if (error) throw error;
      const [message] = await mapMessages((data ?? []) as DirectMessageRow[]);
      return message ?? null;
    },

    async sendMessage(input) {
      const uploadedImage = await media.uploadMediaToObjectStore({
        bucketName: "dm-message-media",
        objectPathPrefix: input.conversationId,
        mediaUpload: input.imageUpload
          ? {
              body: input.imageUpload.body,
              filename: input.imageUpload.filename,
              expiresInHours: input.imageUpload.expiresInHours,
              contentType: input.imageUpload.contentType,
            }
          : undefined,
        allowedMediaKinds: ["image"],
      });

      try {
        const { data, error } = await client.rpc(
          "send_dm_message" as never,
          {
            p_conversation_id: input.conversationId,
            p_content: input.content,
            p_metadata: input.metadata ?? {},
            p_image_attachment: uploadedImage
              ? {
                  bucketName: uploadedImage.bucketName,
                  objectPath: uploadedImage.objectPath,
                  originalFilename: uploadedImage.originalFilename,
                  mimeType: uploadedImage.mimeType,
                  mediaKind: uploadedImage.mediaKind,
                  sizeBytes: uploadedImage.sizeBytes,
                  expiresInHours: uploadedImage.expiresInHours,
                }
              : null,
          } as never,
        );
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : null) as DirectMessageRow | null;
        if (!row) {
          throw new Error("DM send returned no message row.");
        }
        const [message] = await mapMessages([row]);
        if (!message) {
          throw new Error("DM send returned no message row.");
        }
        return message;
      } catch (error) {
        await media.removeUploadedMediaObject(uploadedImage);
        throw error;
      }
    },

    async markConversationRead(conversationId) {
      return callBooleanRpc("mark_dm_conversation_read", { p_conversation_id: conversationId });
    },

    async setConversationMuted({ conversationId, muted }) {
      return callBooleanRpc("set_dm_conversation_muted", {
        p_conversation_id: conversationId,
        p_muted: muted,
      });
    },

    async reportMessage({ messageId, kind, comment }) {
      const { data, error } = await client.rpc(
        "report_dm_message" as never,
        {
          p_message_id: messageId,
          p_kind: kind,
          p_comment: comment,
        } as never,
      );
      if (error) throw error;
      const reportId = data as unknown;
      if (typeof reportId !== "string" || reportId.trim().length === 0) {
        throw new Error("DM report creation returned no id.");
      }
      return reportId;
    },
  };
}
