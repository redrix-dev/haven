/** Views over `NotificationsState`, worked out when read. Both platforms use these. */

import type { PreferenceValues } from "@shared/lib/backend/notifications";
import type {
  Notification,
  NotificationKind,
} from "@shared/lib/backend/records";
import type { NotificationsState } from "./notifications";

/** The inbox as loaded, newest first. */
export function inboxNotifications(state: NotificationsState): Notification[] {
  const notifications: Notification[] = [];
  for (const id of state.inbox?.ids ?? []) {
    const notification = state.byId[id];
    if (notification) notifications.push(notification);
  }
  return notifications;
}

/** The person's choice for a kind. A kind they never changed is on everywhere. */
export function preferenceFor(
  state: NotificationsState,
  kind: NotificationKind,
): PreferenceValues {
  const { in_app, sound, push } = state.preferences[kind] ?? {
    in_app: true,
    sound: true,
    push: true,
  };
  return { in_app, sound, push };
}
