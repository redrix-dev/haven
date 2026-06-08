import type { MessageBundle } from "@shared/lib/backend/types";
import type { ChannelMeta } from "./types";

export const messagesEqual = (
  a: MessageBundle[],
  b: MessageBundle[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const channelMetaEqual = (a: ChannelMeta, b: ChannelMeta): boolean =>
  a.hasMore === b.hasMore && a.cursor === b.cursor;
