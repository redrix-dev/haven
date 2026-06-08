import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/nexus/Nexus";
import type { NotificationNexusState } from "@shared/nexus/notifications/notificationTypes";
import type {
  NotificationCounts,
  NotificationItem,
} from "@shared/lib/backend/types";

const DEFAULT_COUNTS: NotificationCounts = { unseenCount: 0, unreadCount: 0 };

const initialState = (): NotificationNexusState => ({
  entities: {},
  recipientOrder: [],
  counts: DEFAULT_COUNTS,
  isLoading: false,
  hasMore: false,
  inboxLastLoadedAt: 0,
  preferences: null,
  preferencesLoading: false,
  preferencesSaving: false,
  preferencesLastLoadedAt: 0,
  revision: 0,
});

/** Solid-native notification cache — calls shared selectors, no zustand. */
export class NotificationSolidCache {
  readonly state: NotificationNexusState;
  readonly reactiveStore: NotifyingReadableStore<NotificationNexusState>;
  private readonly setState: (
    updater: (
      state: NotificationNexusState,
    ) => Partial<NotificationNexusState> | NotificationNexusState,
  ) => void;

  constructor() {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setNotifications(
    items: NotificationItem[],
    options: { hasMore: boolean },
  ): void {
    const entities: Record<string, NexusEntry<NotificationItem>> = {};
    const recipientOrder: string[] = [];
    for (const item of items) {
      entities[item.recipientId] = {
        data: item,
        partial: false,
        cachedAt: Date.now(),
      };
      recipientOrder.push(item.recipientId);
    }
    this.setState((s) => ({
      entities,
      recipientOrder,
      hasMore: options.hasMore,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  setCounts(counts: NotificationCounts): void {
    this.setState((s) => ({
      counts,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }
}

export function createNotificationSolidCache(): NotificationSolidCache {
  return new NotificationSolidCache();
}
