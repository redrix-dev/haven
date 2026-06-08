import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { NotificationNexus } from "./NotificationNexus";

export function createNotificationNexus(
  persistence: NexusPersistence,
  backend: NotificationBackend,
): NotificationNexus {
  return new NotificationNexus(persistence, backend);
}
