import type { NotificationNexusState } from './notificationTypes'
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
} from '@shared/lib/backend/types'

/**
 * Pure, framework-agnostic projections + equality fns for the notification
 * store. Single source of truth for "which slice + how to compare", consumed by
 * both `@mobile-data/hooks` and `@solid-bindings`. Memoization lives in the adapters.
 */

const EMPTY_NOTIFICATIONS: NotificationItem[] = []

export const projectNotifications = (
  state: NotificationNexusState,
): NotificationItem[] => {
  if (state.recipientOrder.length === 0) return EMPTY_NOTIFICATIONS
  return state.recipientOrder
    .map((id) => state.entities[id]?.data)
    .filter((item): item is NotificationItem => item !== undefined)
}

export const selectCounts = (
  state: NotificationNexusState,
): NotificationCounts => state.counts

export const selectIsLoading = (state: NotificationNexusState): boolean =>
  state.isLoading

export const selectPreferences = (
  state: NotificationNexusState,
): NotificationPreferences | null => state.preferences

export const selectPreferencesLoading = (
  state: NotificationNexusState,
): boolean => state.preferencesLoading

export const selectPreferencesSaving = (
  state: NotificationNexusState,
): boolean => state.preferencesSaving

export const notificationsEqual = (
  a: NotificationItem[],
  b: NotificationItem[],
): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].recipientId !== b[i].recipientId) return false
  }
  return true
}
