import { createMemo, type Accessor } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  countFilteredUnreadInInbox,
  filterNotificationsForInbox,
} from "@shared/features/notifications/inboxNotificationFilter";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import {
  NotificationNexus,
  createInitialNotificationState,
} from "@shared/nexus/notifications/notificationNexus";
import {
  projectNotifications,
  selectCounts,
} from "@shared/nexus/notifications/notificationSelectors";
import type {
  IncomingNotification,
  NotificationState,
} from "@shared/nexus/notifications/notificationTypes";
import { createSolidStatePort } from "../kit/solidStatePort";

export type { IncomingNotification };

/** Solid read bindings over the shared NotificationNexus. */
export class NotificationSolidNexus extends NotificationNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: NotificationState;

  constructor(persistence: NexusPersistence, backend: NotificationBackend) {
    const port = createSolidStatePort(createInitialNotificationState());
    super(port, persistence, backend);
    this.state = port.tracked;
  }

  notifications(): Accessor<NotificationItem[]> {
    return createMemo(() => projectNotifications(this.state));
  }

  counts(): Accessor<NotificationCounts> {
    return createMemo(() => selectCounts(this.state));
  }

  /** Inbox rows — excludes DMs, friend requests and dismissed rows (shared filter). */
  inboxNotifications(): Accessor<NotificationItem[]> {
    return createMemo(() =>
      filterNotificationsForInbox(projectNotifications(this.state)),
    );
  }

  /** Unread inbox rows — the bell badge count. */
  inboxUnreadCount(): Accessor<number> {
    return createMemo(() =>
      countFilteredUnreadInInbox(projectNotifications(this.state)),
    );
  }

  /** Latest realtime arrival, for the toast layer to watch. */
  incoming(): Accessor<IncomingNotification | null> {
    return createMemo(() => this.state.incoming);
  }

  preferences(): Accessor<NotificationPreferences | null> {
    return createMemo(() => this.state.preferences);
  }
}
