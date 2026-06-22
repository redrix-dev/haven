import { createMemo, createSignal, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import {
  projectNotifications,
  selectCounts,
} from "@shared/nexus/notifications/notificationSelectors";
import {
  countFilteredUnreadInInbox,
  filterNotificationsForInbox,
} from "@shared/features/notifications/inboxNotificationFilter";
import type { NotificationNexusState } from "@shared/nexus/notifications/notificationTypes";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  NotificationCounts,
  NotificationItem,
} from "@shared/lib/backend/types";

/**
 * NotificationSolidNexus — the notification domain for the Solid client.
 *
 * Converted from the old `XSolidCache` (NotifyingReadableStore + manual
 * `notify()` + `revision`) to the nexus pattern: holds a Solid store directly,
 * mutates with path-based `setState`, and exposes reactive projections built on
 * the shared selectors. See channelSolidNexus.md for the full walkthrough.
 *
 * Beyond the inbox state it owns a small `incoming` signal — a one-shot feed of
 * realtime arrivals the toast layer watches. It's a Solid signal rather than a
 * store field because the shared `NotificationNexusState` is also mobile's, and
 * this is web-only chrome.
 */

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

/** A realtime arrival surfaced to the toast layer; `seq` fires one toast per
 *  arrival even when the same item repeats. */
export type IncomingNotification = { item: NotificationItem; seq: number };

export class NotificationSolidNexus {
  readonly state: NotificationNexusState;
  private readonly setState: SetStoreFunction<NotificationNexusState>;
  private listInflight: Promise<void> | null = null;
  private readonly incomingSignal: Accessor<IncomingNotification | null>;
  private readonly setIncoming: (value: IncomingNotification | null) => void;

  constructor(private readonly backend: NotificationBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
    const [incoming, setIncoming] = createSignal<IncomingNotification | null>(
      null,
    );
    this.incomingSignal = incoming;
    this.setIncoming = setIncoming;
  }

  // ─── reactive projections (call from component scope) ──────────────────────

  notifications(): Accessor<NotificationItem[]> {
    return createMemo(() => projectNotifications(this.state));
  }

  counts(): Accessor<NotificationCounts> {
    return createMemo(() => selectCounts(this.state));
  }

  /** Inbox rows — excludes DMs / friend-requests / dismissed (shared filter). */
  inboxNotifications(): Accessor<NotificationItem[]> {
    return createMemo(() =>
      filterNotificationsForInbox(projectNotifications(this.state)),
    );
  }

  /** Unread inbox rows — the bell badge count. */
  inboxUnreadCount(): Accessor<number> {
    return createMemo(() =>
      countFilteredUnreadInInbox(projectNotifications(this.state)),
    );
  }

  /** Latest realtime arrival, for the toast layer to watch. */
  incoming(): Accessor<IncomingNotification | null> {
    return this.incomingSignal;
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  async loadInbox(): Promise<void> {
    if (this.listInflight) return this.listInflight;

    this.listInflight = (async () => {
      this.setState("isLoading", true);
      try {
        const [items, counts] = await Promise.all([
          this.backend.listNotifications({ limit: PAGE_SIZE }),
          this.backend.getNotificationCounts().catch(() => DEFAULT_COUNTS),
        ]);
        this.setNotifications(items, { hasMore: items.length === PAGE_SIZE });
        this.setCounts(counts);
        this.setState("inboxLastLoadedAt", Date.now());
      } finally {
        this.setState("isLoading", false);
        this.listInflight = null;
      }
    })();

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
      console.warn("[NotificationSolidNexus] refreshCounts failed", err);
    }
  }

  // ─── actions (optimistic, then reconcile) ──────────────────────────────────

  /** Mark notifications read. Optimistic, with a reload on failure. */
  async markRead(recipientIds: string[]): Promise<void> {
    if (recipientIds.length === 0) return;
    const now = new Date().toISOString();
    for (const id of recipientIds) {
      if (this.state.entities[id]?.data.readAt == null) {
        this.setState("entities", id, "data", "readAt", now);
      }
    }
    try {
      await this.backend.markNotificationsRead(recipientIds);
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationSolidNexus] markRead failed", err);
      await this.loadInbox();
    }
  }

  /** Mark every currently-unread inbox row read. */
  async markAllRead(): Promise<void> {
    const ids = filterNotificationsForInbox(projectNotifications(this.state))
      .filter((item) => item.readAt == null)
      .map((item) => item.recipientId);
    await this.markRead(ids);
  }

  /** Clear the "unseen" badge once the inbox has been opened. */
  async markAllSeen(): Promise<void> {
    try {
      await this.backend.markAllNotificationsSeen();
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationSolidNexus] markAllSeen failed", err);
    }
  }

  /** Dismiss notifications (removes them from the inbox). Optimistic. */
  async dismiss(recipientIds: string[]): Promise<void> {
    if (recipientIds.length === 0) return;
    const now = new Date().toISOString();
    for (const id of recipientIds) {
      if (this.state.entities[id]) {
        this.setState("entities", id, "data", "dismissedAt", now);
      }
    }
    try {
      await this.backend.dismissNotifications(recipientIds);
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationSolidNexus] dismiss failed", err);
      await this.loadInbox();
    }
  }

  // ─── writes ──────────────────────────────────────────────────────────────

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
    this.setState("entities", entities);
    this.setState("recipientOrder", recipientOrder);
    this.setState("hasMore", options.hasMore);
  }

  setCounts(counts: NotificationCounts): void {
    this.setState("counts", counts);
  }

  /**
   * Surface the newest loaded notification as a one-shot toast. Realtime-only —
   * call after a realtime `loadInbox`, never on bootstrap — and gated on the
   * item's in-app delivery flag so suppressed notifications stay silent.
   */
  markIncomingFromNewest(): void {
    const newest = projectNotifications(this.state)[0];
    if (!newest || !newest.deliverInApp) return;
    const seq = (this.incomingSignal()?.seq ?? 0) + 1;
    this.setIncoming({ item: newest, seq });
  }

  rehydrate(): void {}

  clear(): void {
    this.setState(initialState());
    this.setIncoming(null);
  }
}

export function createNotificationSolidNexus(
  backend: NotificationBackend,
): NotificationSolidNexus {
  return new NotificationSolidNexus(backend);
}
