import type { NotificationNexus } from "../notifications/NotificationNexus";
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

export function useNotifications(nexus: NotificationNexus): NotificationItem[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectNotifications,
    notificationsEqual,
  );
}

export function useNotificationCounts(
  nexus: NotificationNexus,
): NotificationCounts {
  return useStoreSelector(nexus.reactiveStore, selectCounts);
}

export function useNotificationsLoading(nexus: NotificationNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function useNotificationPreferences(
  nexus: NotificationNexus,
): NotificationPreferences | null {
  return useStoreSelector(nexus.reactiveStore, selectPreferences);
}

export function useNotificationPreferencesLoading(
  nexus: NotificationNexus,
): boolean {
  return useStoreSelector(nexus.reactiveStore, selectPreferencesLoading);
}

export function useNotificationPreferencesSaving(
  nexus: NotificationNexus,
): boolean {
  return useStoreSelector(nexus.reactiveStore, selectPreferencesSaving);
}
