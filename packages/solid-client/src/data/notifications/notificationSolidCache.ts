import { createStore } from "solid-js/store";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type { NotificationNexusState } from "@shared/nexus/notifications/notificationTypes";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  NotificationCounts,
  NotificationItem,
} from "@shared/lib/backend/types";

const DEFAULT_COUNTS: NotificationCounts = { unseenCount: 0, unreadCount: 0 };
const PAGE_SIZE = 50;

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
  private listInflight: Promise<void> | null = null;

  constructor(private readonly backend: NotificationBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  async loadInbox(): Promise<void> {
    if (this.listInflight) return this.listInflight;

    this.listInflight = (async () => {
      this.setState((s) => ({ isLoading: true, revision: s.revision + 1 }));
      this.reactiveStore.notify();
      try {
        const [items, counts] = await Promise.all([
          this.backend.listNotifications({ limit: PAGE_SIZE }),
          this.backend.getNotificationCounts().catch(() => DEFAULT_COUNTS),
        ]);
        this.setNotifications(items, { hasMore: items.length === PAGE_SIZE });
        this.setCounts(counts);
        this.setState((s) => ({
          inboxLastLoadedAt: Date.now(),
          isLoading: false,
          revision: s.revision + 1,
        }));
        this.reactiveStore.notify();
      } catch (error) {
        this.setState((s) => ({ isLoading: false, revision: s.revision + 1 }));
        this.reactiveStore.notify();
        throw error;
      }
    })().finally(() => {
      this.listInflight = null;
    });

    return this.listInflight;
  }

  async ensureInbox(options?: { freshnessMs?: number }): Promise<void> {
    if (this.listInflight) return this.listInflight;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    if (
      this.state.inboxLastLoadedAt > 0 &&
      Date.now() - this.state.inboxLastLoadedAt < freshnessMs
    ) {
      return;
    }
    await this.loadInbox();
  }

  async refreshCounts(): Promise<void> {
    try {
      const counts = await this.backend.getNotificationCounts();
      this.setCounts(counts);
    } catch (err) {
      console.warn("[NotificationSolidCache] refreshCounts failed", err);
    }
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

  rehydrate(): void {}

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }
}

export function createNotificationSolidCache(
  backend: NotificationBackend,
): NotificationSolidCache {
  return new NotificationSolidCache(backend);
}
