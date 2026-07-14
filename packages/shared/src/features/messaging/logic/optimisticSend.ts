import type { MessageBundle } from "@shared/lib/backend/types";

export function buildOptimisticSendBundle(input: {
  id: string;
  channelId: string;
  content: string;
  replyToMessageId?: string | null;
  senderUserId?: string | null;
  senderIsPlatformStaff?: boolean;
  /**
   * Ordering timestamp for the optimistic row. Callers should pass a value
   * clamped to be no earlier than the newest message already in the channel
   * so a skewed client clock can't sort the just-sent message above older
   * ones. Falls back to the client clock when omitted.
   */
  createdAt?: string;
}): MessageBundle {
  return {
    id: input.id,
    channelId: input.channelId,
    authorUserId: input.senderUserId ?? null,
    displayName: "…",
    avatarSnapshotUrl: null,
    content: input.content,
    metadata: {},
    replyToMessageId: input.replyToMessageId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    isHidden: false,
    isPlatformStaff: input.senderIsPlatformStaff === true,
    reactions: [],
    attachment: null,
    linkPreview: null,
  };
}
