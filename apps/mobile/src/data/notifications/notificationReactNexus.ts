import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  NotificationNexus,
  createInitialNotificationState,
} from "@shared/nexus/notifications/notificationNexus";
import type { NotificationState } from "@shared/nexus/notifications/notificationTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared NotificationNexus: the store the hooks read. */
export class NotificationReactNexus extends NotificationNexus {
  readonly reactiveStore: ReadableStore<NotificationState>;

  constructor(persistence: NexusPersistence, backend: NotificationBackend) {
    const port = createZustandStatePort(createInitialNotificationState());
    super(port, persistence, backend);
    this.reactiveStore = port.store;
  }
}
