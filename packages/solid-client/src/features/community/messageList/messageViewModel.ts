import type { MessageBundle } from "@shared/lib/backend/types";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
  type LiveProfilesRecord,
} from "@shared/lib/liveProfiles";

/**
 * MessageBundle[] → render-ready view items. This is the renderer seam: the
 * list below this point receives only these view models (no cache, no core),
 * so the DOM renderer could be swapped for a canvas surface without touching
 * data wiring. Mirrors the responsibilities of mobile's
 * communityChannelChatFromBundles (grouping, date dividers, reply context,
 * live-profile overlay); if the logic converges further, push the pure parts
 * down to @shared.
 *
 * Author identity follows mobile's chain: live profile (realtime-updated,
 * includes the viewer's own seed) wins over the bundle's snapshot — that's
 * what replaces the optimistic send's "…" placeholder.
 */

export type MessageRowItem = {
  kind: "message";
  id: string;
  message: MessageBundle;
  authorName: string;
  avatarUrl: string | null;
  /** False for a continuation row (same author, close in time) — no avatar/name. */
  showHeader: boolean;
  /** Resolved reply target, when the parent is in the loaded window. */
  replyContext: { displayName: string; preview: string } | null;
};

export type DateDividerItem = {
  kind: "date-divider";
  id: string;
  label: string;
};

export type MessageViewItem = MessageRowItem | DateDividerItem;

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const REPLY_PREVIEW_MAX = 80;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isContinuation(prev: MessageBundle, next: MessageBundle): boolean {
  return (
    prev.authorUserId !== null &&
    prev.authorUserId === next.authorUserId &&
    next.replyToMessageId === null &&
    prev.deletedAt === null &&
    Date.parse(next.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS
  );
}

export function buildMessageViewItems(
  messages: MessageBundle[],
  liveProfiles: LiveProfilesRecord,
): MessageViewItem[] {
  const items: MessageViewItem[] = [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  let prev: MessageBundle | null = null;

  for (const message of messages) {
    const day = dayKey(message.createdAt);
    if (!prev || dayKey(prev.createdAt) !== day) {
      items.push({
        kind: "date-divider",
        id: `divider:${day}`,
        label: dayLabel(message.createdAt),
      });
    }

    const parent = message.replyToMessageId
      ? byId.get(message.replyToMessageId)
      : undefined;
    const replyContext = message.replyToMessageId
      ? {
          displayName: parent
            ? (resolveLiveUsername(
                liveProfiles,
                parent.authorUserId,
                parent.displayName,
              ) ?? "a message")
            : "a message",
          preview: parent ? parent.content.slice(0, REPLY_PREVIEW_MAX) : "",
        }
      : null;

    const authorName =
      message.authorUserId === null
        ? message.displayName
        : (resolveLiveUsername(
            liveProfiles,
            message.authorUserId,
            message.displayName,
          ) ?? message.displayName);

    items.push({
      kind: "message",
      id: message.id,
      message,
      authorName,
      avatarUrl: resolveLiveAvatarUrl(
        liveProfiles,
        message.authorUserId,
        message.avatarSnapshotUrl,
      ),
      showHeader: !prev || !isContinuation(prev, message) || !!replyContext,
      replyContext,
    });
    prev = message;
  }

  return items;
}
