import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Nexus, type NexusEntry, type NexusState } from '../Nexus'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { NotificationBackend } from '@shared/lib/backend/notificationBackend'
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

const STORAGE_KEY = 'haven:nexus:notifications:global'
const PAGE_SIZE = 50

const EMPTY_NOTIFICATIONS: NotificationItem[] = []
const DEFAULT_COUNTS: NotificationCounts = { unseenCount: 0, unreadCount: 0 }

export type NotificationNexusState = NexusState<NotificationItem> & {
  recipientOrder: string[]
  counts: NotificationCounts
  isLoading: boolean
  hasMore: boolean
  preferences: NotificationPreferences | null
  preferencesLoading: boolean
  preferencesSaving: boolean
}

const selectCounts = (state: NotificationNexusState) => state.counts
const selectIsLoading = (state: NotificationNexusState) => state.isLoading
const selectPreferences = (state: NotificationNexusState) => state.preferences
const selectPreferencesLoading = (state: NotificationNexusState) =>
  state.preferencesLoading
const selectPreferencesSaving = (state: NotificationNexusState) =>
  state.preferencesSaving

const notificationsEqual = (
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

export class NotificationNexus extends Nexus<NotificationItem, NotificationItem> {
  private _notificationStore:
    | UseBoundStore<StoreApi<NotificationNexusState>>
    | null = null

  private backend: NotificationBackend | null = null
  private listInflight: Promise<void> | null = null
  private notificationsSnapshot: NotificationItem[] = EMPTY_NOTIFICATIONS

  private readonly notificationsSelector = (
    state: NotificationNexusState,
  ): NotificationItem[] => {
    void state.revision
    if (state.recipientOrder.length === 0) return EMPTY_NOTIFICATIONS
    const next = state.recipientOrder
      .map((id) => state.entities[id]?.data)
      .filter((item): item is NotificationItem => item !== undefined)
    if (notificationsEqual(this.notificationsSnapshot, next)) {
      return this.notificationsSnapshot
    }
    this.notificationsSnapshot = next
    return next
  }

  constructor(persistence: NexusPersistence) {
    super('notifications', 'global', persistence)
  }

  setBackend(backend: NotificationBackend): void {
    this.backend = backend
  }

  /** Test-only access to the underlying store. */
  getReactiveStore(): UseBoundStore<StoreApi<NotificationNexusState>> {
    return this.store
  }

  protected transform(raw: NotificationItem): NotificationItem {
    return raw
  }

  protected override get store(): UseBoundStore<
    StoreApi<NotificationNexusState>
  > {
    if (!this._notificationStore) {
      this._notificationStore = create<NotificationNexusState>(() => ({
        entities: {},
        recipientOrder: [],
        counts: DEFAULT_COUNTS,
        isLoading: false,
        hasMore: false,
        preferences: null,
        preferencesLoading: false,
        preferencesSaving: false,
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

  async loadPreferences(): Promise<NotificationPreferences> {
    if (!this.backend) {
      throw new Error('NotificationNexus.loadPreferences called before backend attached.')
    }
    this.setPreferencesLoading(true)
    try {
      const preferences = await this.backend.getNotificationPreferences()
      this.setPreferences(preferences)
      return preferences
    } finally {
      this.setPreferencesLoading(false)
    }
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

  async markSeen(recipientIds: string[]): Promise<void> {
    if (!this.backend) {
      throw new Error('NotificationNexus.markSeen called before backend attached.')
    }
    if (recipientIds.length === 0) return
    await this.backend.markNotificationsSeen(recipientIds)
    void this.refreshCounts()
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

  useNotifications(): NotificationItem[] {
    return useStoreWithEqualityFn(
      this.store,
      this.notificationsSelector,
      notificationsEqual,
    )
  }

  useCounts(): NotificationCounts {
    return useStoreWithEqualityFn(this.store, selectCounts)
  }

  useIsLoading(): boolean {
    return useStoreWithEqualityFn(this.store, selectIsLoading)
  }

  usePreferences(): NotificationPreferences | null {
    return useStoreWithEqualityFn(this.store, selectPreferences)
  }

  usePreferencesLoading(): boolean {
    return useStoreWithEqualityFn(this.store, selectPreferencesLoading)
  }

  usePreferencesSaving(): boolean {
    return useStoreWithEqualityFn(this.store, selectPreferencesSaving)
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
        revision: 0,
      }))
    } catch (error) {
      console.warn('[NotificationNexus] rehydrate failed', error)
      this.persistence.remove(STORAGE_KEY)
    }
  }

  override clear(): void {
    this.store.setState({
      entities: {},
      recipientOrder: [],
      counts: DEFAULT_COUNTS,
      isLoading: false,
      hasMore: false,
      preferences: null,
      preferencesLoading: false,
      preferencesSaving: false,
      revision: 0,
    })
    this.notificationsSnapshot = EMPTY_NOTIFICATIONS
    this.persistence.remove(STORAGE_KEY)
  }
}
