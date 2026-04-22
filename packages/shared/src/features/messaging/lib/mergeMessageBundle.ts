import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from "@shared/lib/backend/types";

export const compareMessagesAsc = (left: Message, right: Message): number => {
  if (left.created_at < right.created_at) return -1;
  if (left.created_at > right.created_at) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
};

export const computeNewestMessageCursor = (
  messages: Message[],
): { createdAt: string; id: string } | null => {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];
  return { createdAt: last.created_at, id: last.id };
};

/** Merge message rows by id; incoming overwrites existing for the same id. Result sorted ascending. */
export const mergeMessagesById = (
  existing: Message[],
  incoming: Message[],
): Message[] => {
  const byId = new Map<string, Message>();
  for (const m of existing) {
    byId.set(m.id, m);
  }
  for (const m of incoming) {
    byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort(compareMessagesAsc);
};

export const mergeReactionsById = (
  existing: MessageReaction[],
  incoming: MessageReaction[],
): MessageReaction[] => {
  const byId = new Map<string, MessageReaction>();
  for (const r of existing) {
    byId.set(r.id, r);
  }
  for (const r of incoming) {
    byId.set(r.id, r);
  }
  return Array.from(byId.values());
};

export const mergeAttachmentsById = (
  existing: MessageAttachment[],
  incoming: MessageAttachment[],
): MessageAttachment[] => {
  const byId = new Map<string, MessageAttachment>();
  for (const a of existing) {
    byId.set(a.id, a);
  }
  for (const a of incoming) {
    byId.set(a.id, a);
  }
  return Array.from(byId.values());
};

export const mergeLinkPreviewsById = (
  existing: MessageLinkPreview[],
  incoming: MessageLinkPreview[],
): MessageLinkPreview[] => {
  const byId = new Map<string, MessageLinkPreview>();
  for (const p of existing) {
    byId.set(p.id, p);
  }
  for (const p of incoming) {
    byId.set(p.id, p);
  }
  return Array.from(byId.values());
};

/** Reasons that require a full window reload (not merge-only soft revalidate). */
export const CHANNEL_MESSAGE_FULL_RELOAD_REASONS = new Set([
  "initial",
  "maintenance_reload",
  "messages_sub_fallback",
  "reactions_sub_fallback",
  "attachments_sub_fallback",
  "previews_sub_fallback",
]);

export const parseMessageReloadReasons = (
  reasonLabel: string,
): readonly string[] => reasonLabel.split("+").filter(Boolean);

export const messageReloadReasonsRequireFullLoad = (
  reasons: readonly string[],
): boolean => reasons.some((r) => CHANNEL_MESSAGE_FULL_RELOAD_REASONS.has(r));
