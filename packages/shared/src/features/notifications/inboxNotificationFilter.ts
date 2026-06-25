import type {
  NotificationItem,
  NotificationKind,
} from "@shared/lib/backend/types";

/**
 * Kinds excluded from the notification center inbox (mobile + derived bell unread).
 * - `dm_message`: surfaced in the DM workspace.
 * - Friend-request kinds: handled in the Friends modal; server aggregate unread counts may still
 *   include these until RPCs are split (future backend tweak).
 */
export const NOTIFICATION_INBOX_EXCLUDED_KINDS: ReadonlySet<NotificationKind> =
  new Set(["dm_message", "friend_request_received", "friend_request_accepted"]);

export function isNotificationInboxRow(
  notification: NotificationItem,
): boolean {
  if (notification.dismissedAt) return false;
  return !NOTIFICATION_INBOX_EXCLUDED_KINDS.has(notification.kind);
}

export function filterNotificationsForInbox(
  notifications: NotificationItem[],
): NotificationItem[] {
  return notifications.filter(isNotificationInboxRow);
}

/** Unread = no readAt (matches desktop row semantics). */
export function countFilteredUnreadInInbox(
  notifications: NotificationItem[],
): number {
  let n = 0;
  for (const item of notifications) {
    if (!isNotificationInboxRow(item)) continue;
    if (item.readAt == null) n += 1;
  }
  return n;
}
