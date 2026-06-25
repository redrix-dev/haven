import type { MessageBundle } from "@shared/lib/backend/types";

export function buildOptimisticSendBundle(input: {
  id: string;
  channelId: string;
  content: string;
  replyToMessageId?: string | null;
  senderUserId?: string | null;
  senderIsPlatformStaff?: boolean;
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
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    isHidden: false,
    isPlatformStaff: input.senderIsPlatformStaff === true,
    reactions: [],
    attachment: null,
    linkPreview: null,
  };
}
