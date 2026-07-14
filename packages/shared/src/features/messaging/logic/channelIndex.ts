import type { MessageBundle } from "@shared/lib/backend/types";

/**
 * Parse a message timestamp to epoch millis for ordering.
 *
 * Ordering MUST NOT depend on the string format: optimistic sends produce
 * `2026-...Z` while server rows arrive as `2026-...+00:00`. A lexicographic
 * compare mis-sorts those ('Z' sorts after any digit). Parse to a number and
 * compare numerically so every source is on the same axis.
 */
const createdAtEpoch = (value: string | undefined): number => {
  if (!value) return Number.POSITIVE_INFINITY; // unknown → treat as newest, keep at tail
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/** Insert a message id into an ascending channel index (oldest → newest). */
export function insertMessageIdIntoChannelIndex(
  existing: readonly string[],
  messageId: string,
  createdAt: string,
  getCreatedAt: (id: string) => string | undefined,
): string[] {
  if (existing.includes(messageId)) return [...existing];

  const target = createdAtEpoch(createdAt);
  const insertAt = existing.findIndex(
    (id) => createdAtEpoch(getCreatedAt(id)) > target,
  );

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

/**
 * Upsert a message into the index, RE-POSITIONING it if already present.
 *
 * Plain insert freezes a message at its first-seen slot (early-returns on a
 * known id). That's wrong for reconciliation: an optimistic send is placed by
 * the client clock, then the authoritative server `created_at` arrives — and
 * must be allowed to move the message to its true slot. Remove-then-insert
 * guarantees the latest known timestamp wins.
 */
export function upsertMessageIntoChannelIndex(
  existing: readonly string[],
  message: MessageBundle,
  getCreatedAt: (id: string) => string | undefined,
): string[] {
  const withoutId = existing.includes(message.id)
    ? removeMessageIdFromChannelIndex(existing, message.id)
    : existing;

  // getCreatedAt reads the caller's store, which still holds the *new* createdAt
  // for message.id — but message.id is excluded from `withoutId`, so it never
  // compares against itself.
  return insertMessageIdIntoChannelIndex(
    withoutId,
    message.id,
    message.createdAt,
    getCreatedAt,
  );
}
