import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  countFilteredUnreadInInbox,
  filterNotificationsForInbox,
} from "@shared/features/notifications/inboxNotificationFilter";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  ExpoPushSubscriptionRecord,
  ExpoPushSubscriptionUpsertInput,
  NotificationCounts,
  NotificationItem,
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import { createLoadGate, isFresh } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";
import { projectNotifications } from "./notificationSelectors";
import type { NotificationState } from "./notificationTypes";

const PAGE_SIZE = 50;
const DEFAULT_FRESHNESS_MS = 60_000;

const emptyCounts = (): NotificationCounts => ({
  unseenCount: 0,
  unreadCount: 0,
});

export const createInitialNotificationState = (): NotificationState => ({
  entities: {},
  recipientOrder: [],
  counts: emptyCounts(),
  isLoading: false,
  hasMore: false,
  inboxLastLoadedAt: 0,
  preferences: null,
  preferencesLoading: false,
  preferencesSaving: false,
  preferencesLastLoadedAt: 0,
  incoming: null,
});

type PersistedNotifications = Pick<
  NotificationState,
  "entities" | "recipientOrder" | "counts" | "inboxLastLoadedAt"
>;

/**
 * The notification inbox, its unseen/unread counts, the viewer's notification
 * preferences, and the latest realtime arrival for the toast layer.
 *
 * Read, dismiss and similar actions are optimistic: the row changes at once,
 * the backend is told, counts are refreshed, and a failure reloads the inbox to
 * restore server truth.
 */
export class NotificationNexus {
  private readonly inboxLoads = createLoadGate();
  private readonly preferenceLoads = createLoadGate();

  constructor(
    protected readonly port: StatePort<NotificationState>,
    private readonly persistence: NexusPersistence,
    private readonly backend: NotificationBackend,
  ) {}

  // ─── reads ─────────────────────────────────────────────────────────────────

  getNotification(recipientId: string): NotificationItem | undefined {
    return this.port.get().entities[recipientId]?.data;
  }

  getCounts(): NotificationCounts {
    return this.port.get().counts;
  }

  // ─── inbox ─────────────────────────────────────────────────────────────────

  loadInbox(): Promise<void> {
    return this.inboxLoads.run("inbox", async (stale) => {
      this.port.set({ isLoading: true });
      try {
        const [items, counts] = await Promise.all([
          this.backend.listNotifications({ limit: PAGE_SIZE }),
          this.backend.getNotificationCounts().catch(() => emptyCounts()),
        ]);
        if (stale()) return;
        this.setNotifications(items, items.length === PAGE_SIZE);
        this.port.set({ counts, inboxLastLoadedAt: Date.now() });
        this.persist();
      } finally {
        this.port.set({ isLoading: false });
      }
    });
  }

  ensureInbox(options?: { freshnessMs?: number }): Promise<void> {
    if (this.inboxLoads.isRunning("inbox")) return this.loadInbox();
    const freshnessMs = options?.freshnessMs ?? DEFAULT_FRESHNESS_MS;
    if (isFresh(this.port.get().inboxLastLoadedAt, freshnessMs)) {
      return Promise.resolve();
    }
    return this.loadInbox();
  }

  async refreshCounts(): Promise<void> {
    try {
      this.port.set({ counts: await this.backend.getNotificationCounts() });
      this.persist();
    } catch (err) {
      console.warn("[NotificationNexus] refreshCounts failed", err);
    }
  }

  /** Mark notifications read — optimistic, reconciled by a reload on failure. */
  async markRead(recipientIds: string[]): Promise<void> {
    if (recipientIds.length === 0) return;
    this.patchItems(recipientIds, (item) =>
      item.readAt == null
        ? { ...item, readAt: new Date().toISOString() }
        : item,
    );
    try {
      await this.backend.markNotificationsRead(recipientIds);
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationNexus] markRead failed", err);
      await this.loadInbox();
    }
  }

  /** Mark every unread inbox row read. */
  async markAllRead(): Promise<void> {
    const unread = filterNotificationsForInbox(
      projectNotifications(this.port.get()),
    )
      .filter((item) => item.readAt == null)
      .map((item) => item.recipientId);
    await this.markRead(unread);
  }

  /** Clear the unseen badge once the inbox has been opened. Best effort. */
  async markAllSeen(): Promise<void> {
    try {
      await this.backend.markAllNotificationsSeen();
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationNexus] markAllSeen failed", err);
    }
  }

  async markSeen(recipientIds: string[]): Promise<void> {
    if (recipientIds.length === 0) return;
    await this.backend.markNotificationsSeen(recipientIds);
    await this.refreshCounts();
  }

  /** Dismiss notifications from the inbox — optimistic, reconciled by a reload on failure. */
  async dismiss(recipientIds: string[]): Promise<void> {
    if (recipientIds.length === 0) return;
    const now = new Date().toISOString();
    this.patchItems(recipientIds, (item) => ({ ...item, dismissedAt: now }));
    try {
      await this.backend.dismissNotifications(recipientIds);
      await this.refreshCounts();
    } catch (err) {
      console.warn("[NotificationNexus] dismiss failed", err);
      await this.loadInbox();
    }
  }

  /** Unread inbox rows — the bell badge count. */
  getInboxUnreadCount(): number {
    return countFilteredUnreadInInbox(projectNotifications(this.port.get()));
  }

  /**
   * Surface the newest loaded notification as a one-shot toast. Call after a
   * realtime `loadInbox`, never on bootstrap. Items not flagged for in-app
   * delivery stay silent.
   */
  markIncomingFromNewest(): void {
    const newest = projectNotifications(this.port.get())[0];
    if (!newest || !newest.deliverInApp) return;
    const seq = (this.port.get().incoming?.seq ?? 0) + 1;
    this.port.set({ incoming: { item: newest, seq } });
  }

  // ─── preferences ───────────────────────────────────────────────────────────

  loadPreferences(): Promise<NotificationPreferences> {
    return this.preferenceLoads.run("preferences", async (stale) => {
      this.port.set({ preferencesLoading: true });
      try {
        const preferences = await this.backend.getNotificationPreferences();
        if (stale()) return preferences;
        this.port.set({ preferences, preferencesLastLoadedAt: Date.now() });
        return preferences;
      } finally {
        this.port.set({ preferencesLoading: false });
      }
    });
  }

  async ensurePreferences(options?: {
    freshnessMs?: number;
  }): Promise<NotificationPreferences | null> {
    const freshnessMs = options?.freshnessMs ?? DEFAULT_FRESHNESS_MS;
    const { preferences, preferencesLastLoadedAt } = this.port.get();
    if (preferences && isFresh(preferencesLastLoadedAt, freshnessMs)) {
      return preferences;
    }
    return this.loadPreferences();
  }

  async savePreferences(
    values: NotificationPreferenceUpdate,
  ): Promise<NotificationPreferences> {
    this.port.set({ preferencesSaving: true });
    try {
      const preferences =
        await this.backend.updateNotificationPreferences(values);
      this.port.set({ preferences, preferencesLastLoadedAt: Date.now() });
      await this.loadInbox();
      return preferences;
    } finally {
      this.port.set({ preferencesSaving: false });
    }
  }

  // ─── push registration (mobile) ────────────────────────────────────────────

  upsertExpoPushSubscription(
    input: ExpoPushSubscriptionUpsertInput,
  ): Promise<ExpoPushSubscriptionRecord> {
    return this.backend.upsertExpoPushSubscription(input);
  }

  deleteExpoPushSubscription(expoPushToken: string): Promise<boolean> {
    return this.backend.deleteExpoPushSubscription(expoPushToken);
  }

  // ─── persistence + lifecycle ───────────────────────────────────────────────

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.notifications);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedNotifications>;
      this.port.set({
        entities: parsed.entities ?? {},
        recipientOrder: parsed.recipientOrder ?? [],
        counts: parsed.counts ?? emptyCounts(),
        inboxLastLoadedAt: parsed.inboxLastLoadedAt ?? 0,
      });
    } catch (error) {
      console.warn("[NotificationNexus] rehydrate failed", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.notifications);
    }
  }

  clear(): void {
    this.inboxLoads.clear();
    this.preferenceLoads.clear();
    this.port.set(createInitialNotificationState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.notifications);
  }

  private setNotifications(items: NotificationItem[], hasMore: boolean): void {
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
    this.port.set({ entities, recipientOrder, hasMore });
  }

  private patchItems(
    recipientIds: readonly string[],
    patch: (item: NotificationItem) => NotificationItem,
  ): void {
    const entities = { ...this.port.get().entities };
    for (const id of recipientIds) {
      const entry = entities[id];
      if (entry) entities[id] = { ...entry, data: patch(entry.data) };
    }
    this.port.set({ entities });
    this.persist();
  }

  private persist(): void {
    try {
      const state = this.port.get();
      const persisted: PersistedNotifications = {
        entities: state.entities,
        recipientOrder: state.recipientOrder,
        counts: state.counts,
        inboxLastLoadedAt: state.inboxLastLoadedAt,
      };
      this.persistence.set(
        NEXUS_STORAGE_KEYS.notifications,
        JSON.stringify(persisted),
      );
    } catch (error) {
      console.warn("[NotificationNexus] persist failed", error);
    }
  }
}
