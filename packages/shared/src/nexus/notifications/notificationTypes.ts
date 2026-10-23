import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import type { EntityMapState } from "@shared/core/cache/entityTypes";

/** A realtime arrival surfaced as a toast; `seq` fires one toast per arrival even when the item repeats. */
export type IncomingNotification = { item: NotificationItem; seq: number };

export type NotificationState = EntityMapState<NotificationItem> & {
  recipientOrder: string[];
  counts: NotificationCounts;
  isLoading: boolean;
  hasMore: boolean;
  inboxLastLoadedAt: number;
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  preferencesSaving: boolean;
  preferencesLastLoadedAt: number;
  /** Latest realtime arrival for the toast layer; null until one arrives. */
  incoming: IncomingNotification | null;
};
