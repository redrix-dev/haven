import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
} from '@shared/lib/backend/types'
import type { NexusState } from '../Nexus'

export type NotificationNexusState = NexusState<NotificationItem> & {
  recipientOrder: string[]
  counts: NotificationCounts
  isLoading: boolean
  hasMore: boolean
  inboxLastLoadedAt: number
  preferences: NotificationPreferences | null
  preferencesLoading: boolean
  preferencesSaving: boolean
  preferencesLastLoadedAt: number
}
