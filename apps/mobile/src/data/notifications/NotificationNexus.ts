import { createStore, type StoreApi } from 'zustand/vanilla'
import { Nexus, type NexusEntry } from '@shared/nexus/Nexus'
import type { ReadableStore } from '@shared/nexus/storeTypes'
import type { NotificationNexusState } from '@shared/nexus/notifications/notificationTypes'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { NotificationBackend } from '@shared/lib/backend/notificationBackend'
import type {
  NotificationCounts,
  ExpoPushSubscriptionRecord,
  ExpoPushSubscriptionUpsertInput,
  NotificationItem,
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from '@shared/lib/backend/types'

const STORAGE_KEY = 'haven:nexus:notifications:global'
const PAGE_SIZE = 50

const DEFAULT_COUNTS: NotificationCounts = { unseenCount: 0, unreadCount: 0 }

export type { NotificationNexusState }

export class NotificationNexus extends Nexus<NotificationItem, NotificationItem> {
  private _notificationStore: StoreApi<NotificationNexusState> | null = null

  private readonly backend: NotificationBackend
  private listInflight: Promise<void> | null = null
  private preferencesInflight: Promise<NotificationPreferences> | null = null

  constructor(persistence: NexusPersistence, backend: NotificationBackend) {
    super('notifications', 'global', persistence)
    this.backend = backend
  }

  /**
   * Read-only store handle for the binding packages — `getState`/`subscribe`
   * only. Also used by tests for state assertions.
   */
  get reactiveStore(): ReadableStore<NotificationNexusState> {
    return this.store
  }

  protected transform(raw: NotificationItem): NotificationItem {
    return raw
  }

  protected override get store(): StoreApi<NotificationNexusState> {
    if (!this._notificationStore) {
      this._notificationStore = createStore<NotificationNexusState>(() => ({
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
      }))
      this.rehydrate()
    }
    return this._notificationStore
  }

  async loadInbox(): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.loadInbox called before backend attached.')
    }
    if (this.listInflight) return this.listInflight

    this.listInflight = (async () => {
      this.setIsLoading(true)
      try {
        const [items, counts] = await Promise.all([
          this.backend!.listNotifications({ limit: PAGE_SIZE }),
          this.backend!.getNotificationCounts().catch(() => DEFAULT_COUNTS),
        ])
        this.setNotifications(items, { hasMore: items.length === PAGE_SIZE })
        this.setCounts(counts)
        this.setInboxLastLoadedAt(Date.now())
      } finally {
        this.setIsLoading(false)
      }
    })().finally(() => {
      this.listInflight = null
    })

    return this.listInflight
  }

  async refreshInbox(): Promise<void> {
    await this.loadInbox()
  }

  async ensureInbox(options?: { freshnessMs?: number }): Promise<void> {
    if (this.listInflight) return this.listInflight
    const freshnessMs = options?.freshnessMs ?? 60_000
    const lastLoadedAt = this.store.getState().inboxLastLoadedAt
    if (lastLoadedAt > 0 && Date.now() - lastLoadedAt < freshnessMs) return
    await this.loadInbox()
  }

  async loadPreferences(): Promise<NotificationPreferences> {
    if (!this.backend) {
      throw new Error('NotificationNexus.loadPreferences called before backend attached.')
    }
    if (this.preferencesInflight) return this.preferencesInflight

    this.preferencesInflight = (async () => {
      this.setPreferencesLoading(true)
      try {
        const preferences = await this.backend.getNotificationPreferences()
        this.setPreferences(preferences)
        this.setPreferencesLastLoadedAt(Date.now())
        return preferences
      } finally {
        this.setPreferencesLoading(false)
      }
    })().finally(() => {
      this.preferencesInflight = null
    })

    return this.preferencesInflight
  }

  async ensurePreferences(
    options?: { freshnessMs?: number },
  ): Promise<NotificationPreferences | null> {
    const freshnessMs = options?.freshnessMs ?? 60_000
    const state = this.store.getState()
    if (
      state.preferences &&
      state.preferencesLastLoadedAt > 0 &&
      Date.now() - state.preferencesLastLoadedAt < freshnessMs
    ) {
      return state.preferences
    }
    return this.loadPreferences()
  }

  async savePreferences(
    values: NotificationPreferenceUpdate,
  ): Promise<NotificationPreferences> {
    if (!this.backend) {
      throw new Error('NotificationNexus.savePreferences called before backend attached.')
    }
    this.setPreferencesSaving(true)
    try {
      const next = await this.backend.updateNotificationPreferences(values)
      this.setPreferences(next)
      await this.refreshInbox()
      return next
    } finally {
      this.setPreferencesSaving(false)
    }
  }

  async markAllSeen(): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.markAllSeen called before backend attached.')
    }
    await this.backend.markAllNotificationsSeen()
    await this.refreshInbox()
  }

  async markRead(recipientIds: string[]): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.markRead called before backend attached.')
    }
    if (recipientIds.length === 0) return
    await this.backend.markNotificationsRead(recipientIds)
    await this.refreshInbox()
  }

  async dismiss(recipientIds: string[]): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.dismiss called before backend attached.')
    }
    if (recipientIds.length === 0) return
    await this.backend.dismissNotifications(recipientIds)
    await this.refreshInbox()
  }

  async dismissAll(): Promise<void> {
    const recipientIds = this.store.getState().recipientOrder
    if (recipientIds.length === 0) return
    await this.dismiss(recipientIds)
  }

  async refreshCounts(): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.refreshCounts called before backend attached.')
    }
    try {
      const counts = await this.backend.getNotificationCounts()
      this.setCounts(counts)
    } catch (err) {
      console.warn('[NotificationNexus] refreshCounts failed', err)
    }
  }

  async upsertExpoPushSubscription(
    input: ExpoPushSubscriptionUpsertInput,
  ): Promise<ExpoPushSubscriptionRecord> {
    if (!this.backend) {
      throw new Error('NotificationNexus.upsertExpoPushSubscription called before backend attached.')
    }
    return this.backend.upsertExpoPushSubscription(input)
  }

  async deleteExpoPushSubscription(expoPushToken: string): Promise<boolean> {
    if (!this.backend) {
      throw new Error('NotificationNexus.deleteExpoPushSubscription called before backend attached.')
    }
    return this.backend.deleteExpoPushSubscription(expoPushToken)
  }

  async markSeen(recipientIds: string[]): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.markSeen called before backend attached.')
    }
    if (recipientIds.length === 0) return
    await this.backend.markNotificationsSeen(recipientIds)
    void this.refreshCounts()
  }

  upsertNotification(item: NotificationItem): void {
    this.store.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [item.recipientId]: {
          data: item,
          partial: false,
          cachedAt: Date.now(),
        },
      },
      recipientOrder: state.recipientOrder.includes(item.recipientId)
        ? state.recipientOrder
        : [item.recipientId, ...state.recipientOrder],
      revision: state.revision + 1,
    }));
    this.persist();
  }

  setNotifications(
    items: NotificationItem[],
    options: { hasMore: boolean },
  ): void {
    const entities: Record<string, NexusEntry<NotificationItem>> = {}
    const recipientOrder: string[] = []
    for (const item of items) {
      entities[item.recipientId] = {
        data: item,
        partial: false,
        cachedAt: Date.now(),
      }
      recipientOrder.push(item.recipientId)
    }
    this.store.setState((state) => ({
      ...state,
      entities,
      recipientOrder,
      hasMore: options.hasMore,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  setCounts(counts: NotificationCounts): void {
    this.store.setState((state) => ({
      ...state,
      counts,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  setIsLoading(loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      isLoading: loading,
      revision: state.revision + 1,
    }))
  }

  setPreferences(preferences: NotificationPreferences | null): void {
    this.store.setState((state) => ({
      ...state,
      preferences,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  setInboxLastLoadedAt(loadedAt: number): void {
    this.store.setState((state) => ({
      ...state,
      inboxLastLoadedAt: loadedAt,
      revision: state.revision + 1,
    }))
  }

  setPreferencesLastLoadedAt(loadedAt: number): void {
    this.store.setState((state) => ({
      ...state,
      preferencesLastLoadedAt: loadedAt,
      revision: state.revision + 1,
    }))
  }

  setPreferencesLoading(loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      preferencesLoading: loading,
      revision: state.revision + 1,
    }))
  }

  setPreferencesSaving(saving: boolean): void {
    this.store.setState((state) => ({
      ...state,
      preferencesSaving: saving,
      revision: state.revision + 1,
    }))
  }

  override persist(): void {
    try {
      const state = this.store.getState()
      this.persistence.set(
        STORAGE_KEY,
        JSON.stringify({
          entities: state.entities,
          recipientOrder: state.recipientOrder,
          counts: state.counts,
          inboxLastLoadedAt: state.inboxLastLoadedAt,
        }),
      )
    } catch (error) {
      console.warn('[NotificationNexus] persist failed', error)
    }
  }

  override rehydrate(): void {
    try {
      const raw = this.persistence.getString(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<NotificationNexusState>
      this.store.setState((state) => ({
        ...state,
        entities: parsed.entities ?? {},
        recipientOrder: parsed.recipientOrder ?? [],
        counts: parsed.counts ?? DEFAULT_COUNTS,
        inboxLastLoadedAt: parsed.inboxLastLoadedAt ?? 0,
        revision: 0,
      }))
    } catch (error) {
      console.warn('[NotificationNexus] rehydrate failed', error)
      this.persistence.remove(STORAGE_KEY)
    }
  }

  override clear(): void {
    this.listInflight = null
    this.preferencesInflight = null
    this.store.setState({
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
    })
    this.persistence.remove(STORAGE_KEY)
  }
}
