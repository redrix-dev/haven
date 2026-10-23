import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { getDirectMessagePreviewText } from "@shared/lib/backend/directMessageUtils";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";

/**
 * Pure rules for ordering conversations and deciding which "latest message"
 * wins when realtime, sends and server reloads race each other.
 */

const DM_PREVIEW_MAX_LENGTH = 180;

const toEpochMs = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const conversationActivityAt = (
  conversation: DirectMessageConversationSummary,
): string | null =>
  conversation.lastMessageAt ??
  conversation.updatedAt ??
  conversation.createdAt;

const conversationLastMessageAt = (
  conversation: DirectMessageConversationSummary,
): string | null =>
  conversation.lastMessageCreatedAt ?? conversation.lastMessageAt;

/** Most recently active first; ties broken by id so the order is stable. */
export const sortConversationIds = (
  ids: string[],
  entities: Record<string, NexusEntry<DirectMessageConversationSummary>>,
): string[] =>
  [...ids].sort((a, b) => {
    const first = entities[a]?.data;
    const second = entities[b]?.data;
    if (!first || !second) return 0;
    const timeDelta =
      toEpochMs(conversationActivityAt(second)) -
      toEpochMs(conversationActivityAt(first));
    if (timeDelta !== 0) return timeDelta;
    return second.conversationId.localeCompare(first.conversationId);
  });

/** Whether a message is the conversation's current latest or newer than it. */
export const isMessageCurrentOrNewerThanSummary = (
  message: DirectMessage,
  conversation: DirectMessageConversationSummary,
): boolean => {
  if (conversation.lastMessageId === message.messageId) return true;
  const currentAt = conversationLastMessageAt(conversation);
  if (!currentAt) return true;
  const messageTime = toEpochMs(message.createdAt);
  const currentTime = toEpochMs(currentAt);
  if (messageTime !== currentTime) return messageTime > currentTime;
  if (!conversation.lastMessageId) return true;
  return message.messageId > conversation.lastMessageId;
};

/** Whether the local summary knows of a newer latest message than a (stale) server reply. */
export const isSummaryNewerThanServerSummary = (
  local: DirectMessageConversationSummary,
  server: DirectMessageConversationSummary,
): boolean => {
  const localTime = toEpochMs(conversationLastMessageAt(local));
  const serverTime = toEpochMs(conversationLastMessageAt(server));
  if (localTime !== serverTime) return localTime > serverTime;
  if (!local.lastMessageId || !server.lastMessageId) {
    return Boolean(local.lastMessageId && !server.lastMessageId);
  }
  return local.lastMessageId > server.lastMessageId;
};

/** Server summary, but keeping the local latest-message fields that are newer. */
export const mergeNewerLocalLatestFields = (
  server: DirectMessageConversationSummary,
  local: DirectMessageConversationSummary,
): DirectMessageConversationSummary => ({
  ...server,
  updatedAt: local.updatedAt,
  lastMessageAt: local.lastMessageAt,
  lastMessageId: local.lastMessageId,
  lastMessageAuthorUserId: local.lastMessageAuthorUserId,
  lastMessagePreview: local.lastMessagePreview,
  lastMessageCreatedAt: local.lastMessageCreatedAt,
  unreadCount: local.unreadCount,
});

/** The sidebar preview line for a message, capped in length. */
export const directMessagePreview = (message: DirectMessage): string | null => {
  const preview = getDirectMessagePreviewText(
    message.content,
    message.attachments.length,
  );
  if (!preview) return null;
  return preview.length > DM_PREVIEW_MAX_LENGTH
    ? `${preview.slice(0, DM_PREVIEW_MAX_LENGTH)}...`
    : preview;
};
