import type { Accessor } from "solid-js";
import type {
  NotificationCounts,
  NotificationItem,
} from "@shared/lib/backend/types";
import {
  notificationsEqual,
  projectNotifications,
  selectCounts,
} from "@shared/nexus/notifications/notificationSelectors";
import { createStoreSelector } from "../fromStore";
import type { NotificationSolidCache } from "./notificationSolidCache";

export function createNotifications(
  cache: NotificationSolidCache,
): Accessor<NotificationItem[]> {
  return createStoreSelector(
    cache.reactiveStore,
    projectNotifications,
    notificationsEqual,
  );
}

export function createNotificationCounts(
  cache: NotificationSolidCache,
): Accessor<NotificationCounts> {
  return createStoreSelector(cache.reactiveStore, selectCounts);
}
