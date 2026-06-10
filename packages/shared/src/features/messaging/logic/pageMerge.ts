import type { MessageBundle } from "@shared/lib/backend/types";
import type { ChannelMeta } from "./types";

/** Reverse a descending RPC page into ascending storage order. */
export function ascendingMessagesFromRpcPage(
  messages: MessageBundle[],
): MessageBundle[] {
  return [...messages].reverse();
}

/** Build pagination cursor from the oldest message in an ascending page. */
export function oldestMessageCursor(ascending: MessageBundle[]): string | null {
  if (ascending.length === 0) return null;
  const oldest = ascending[0];
  return `${oldest.createdAt}|${oldest.id}`;
}

export function mergePageIntoChannelMeta(options: {
  hasMore: boolean;
  cursor: string | null;
  preserveCursorOnEmpty?: string | null;
}): Pick<ChannelMeta, "hasMore" | "cursor"> {
  return {
    hasMore: options.hasMore,
    cursor: options.cursor ?? options.preserveCursorOnEmpty ?? null,
  };
}
