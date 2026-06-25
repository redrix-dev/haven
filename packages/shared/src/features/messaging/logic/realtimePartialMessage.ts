import type { MessageBundle } from "@shared/lib/backend/types";

export function normalizeMessageCreatedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function buildPartialMessageFromRealtimePayload(input: {
  messageId: string;
  channelId: string;
  payload: Record<string, unknown>;
}): MessageBundle {
  const createdAt = input.payload.created_at;
  return {
    id: input.messageId,
    channelId: input.channelId,
    authorUserId:
      typeof input.payload.author_user_id === "string"
        ? input.payload.author_user_id
        : null,
    content:
      typeof input.payload.content === "string" ? input.payload.content : "",
    metadata:
      typeof input.payload.metadata === "object" &&
      input.payload.metadata !== null
        ? (input.payload.metadata as Record<string, unknown>)
        : {},
    createdAt: normalizeMessageCreatedAt(createdAt) ?? new Date().toISOString(),
    editedAt: null,
    deletedAt:
      typeof input.payload.deleted_at === "string" &&
      input.payload.deleted_at.trim()
        ? input.payload.deleted_at
        : null,
    isHidden:
      typeof input.payload.is_hidden === "boolean"
        ? input.payload.is_hidden
        : false,
    displayName: "…",
    avatarSnapshotUrl: null,
    isPlatformStaff: false,
    replyToMessageId: null,
    reactions: [],
    attachment: null,
    linkPreview: null,
  } as MessageBundle;
}
