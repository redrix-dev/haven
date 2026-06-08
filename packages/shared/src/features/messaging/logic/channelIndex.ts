import type { MessageBundle } from "@shared/lib/backend/types";

/** Insert a message id into an ascending channel index (oldest → newest). */
export function insertMessageIdIntoChannelIndex(
  existing: readonly string[],
  messageId: string,
  createdAt: string,
  getCreatedAt: (id: string) => string | undefined,
): string[] {
  if (existing.includes(messageId)) return [...existing];

  const insertAt = existing.findIndex((id) => {
    const entryCreatedAt = getCreatedAt(id);
    if (!entryCreatedAt) return false;
    return entryCreatedAt > createdAt;
  });

  const updated = [...existing];
  if (insertAt === -1) {
    updated.push(messageId);
  } else {
    updated.splice(insertAt, 0, messageId);
  }
  return updated;
}

export function removeMessageIdFromChannelIndex(
  existing: readonly string[],
  messageId: string,
): string[] {
  return existing.filter((id) => id !== messageId);
}

export function insertMessageIntoChannelIndex(
  existing: readonly string[],
  message: MessageBundle,
  getCreatedAt: (id: string) => string | undefined,
): string[] {
  return insertMessageIdIntoChannelIndex(
    existing,
    message.id,
    message.createdAt,
    getCreatedAt,
  );
}
