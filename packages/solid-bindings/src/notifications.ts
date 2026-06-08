import type { Accessor } from "solid-js";
import type { NotificationNexus } from "@shared/nexus/notifications/NotificationNexus";
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import {
  notificationsEqual,
  projectNotifications,
  selectCounts,
  selectIsLoading,
  selectPreferences,
  selectPreferencesLoading,
  selectPreferencesSaving,
} from "@shared/nexus/notifications/notificationSelectors";
import { createStoreSelector } from "./fromStore";

/**
 * Solid bindings for NotificationNexus — mirror of `@react-bindings/notifications`.
 */

export function createNotifications(
  nexus: NotificationNexus,
): Accessor<NotificationItem[]> {
  return createStoreSelector(
    nexus.reactiveStore,
    projectNotifications,
    notificationsEqual,
  );
}

export function createNotificationCounts(
  nexus: NotificationNexus,
): Accessor<NotificationCounts> {
  return createStoreSelector(nexus.reactiveStore, selectCounts);
}

export function createNotificationsLoading(
  nexus: NotificationNexus,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function createNotificationPreferences(
  nexus: NotificationNexus,
): Accessor<NotificationPreferences | null> {
  return createStoreSelector(nexus.reactiveStore, selectPreferences);
}

export function createNotificationPreferencesLoading(
  nexus: NotificationNexus,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, selectPreferencesLoading);
}

export function createNotificationPreferencesSaving(
  nexus: NotificationNexus,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, selectPreferencesSaving);
}
