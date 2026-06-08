import type { NotificationNexusPort } from "@shared/core/cache/entityNexusPorts";
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
import { useStoreSelector } from "./useStoreSelector";

export function useNotifications(nexus: NotificationNexusPort): NotificationItem[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectNotifications,
    notificationsEqual,
  );
}

export function useNotificationCounts(
  nexus: NotificationNexusPort,
): NotificationCounts {
  return useStoreSelector(nexus.reactiveStore, selectCounts);
}

export function useNotificationsLoading(nexus: NotificationNexusPort): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function useNotificationPreferences(
  nexus: NotificationNexusPort,
): NotificationPreferences | null {
  return useStoreSelector(nexus.reactiveStore, selectPreferences);
}

export function useNotificationPreferencesLoading(
  nexus: NotificationNexusPort,
): boolean {
  return useStoreSelector(nexus.reactiveStore, selectPreferencesLoading);
}

export function useNotificationPreferencesSaving(
  nexus: NotificationNexusPort,
): boolean {
  return useStoreSelector(nexus.reactiveStore, selectPreferencesSaving);
}
