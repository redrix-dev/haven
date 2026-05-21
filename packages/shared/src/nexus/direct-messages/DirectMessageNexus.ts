import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Nexus, type NexusEntry, type NexusState } from '../Nexus'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { DirectMessageBackend } from '@shared/lib/backend/directMessageBackend'
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

const STORAGE_KEY = 'haven:nexus:direct-messages:global'
const DM_PAGE_SIZE = 50
const DM_RELOAD_FRESHNESS_WINDOW_MS = 10_000

const EMPTY_CONVERSATIONS: DirectMessageConversationSummary[] = []
const EMPTY_MESSAGES: DirectMessage[] = []

export type DmComposeDraftPeer = {
  userId: string
  displayName: string
}

export type DirectMessageNexusState = NexusState<
  DirectMessageConversationSummary
> & {
  conversationIds: string[]
  messagesByConversation: Record<string, string[]>
  messageEntities: Record<string, DirectMessage>
  hasMoreByConversation: Record<string, boolean>
  activeConversationId: string | null
  isLoadingConversations: boolean
  loadingByConversation: Record<string, boolean>
  messagesLoadComplete: Record<string, boolean>
  messagesLastLoadedAt: Record<string, number>
  composeDraftPeer: DmComposeDraftPeer | null
}

const selectActiveConversationId = (state: DirectMessageNexusState) =>
  state.activeConversationId
const selectIsLoadingConversations = (state: DirectMessageNexusState) =>
  state.isLoadingConversations
const selectComposeDraftPeer = (state: DirectMessageNexusState) =>
  state.composeDraftPeer

export const conversationsEqual = (
  a: DirectMessageConversationSummary[],
  b: DirectMessageConversationSummary[],
): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].conversationId !== b[i].conversationId ||
      a[i].lastMessageId !== b[i].lastMessageId ||
      a[i].unreadCount !== b[i].unreadCount
    ) {
      return false
    }
  }
  return true
}

const directMessagesEqual = (
  a: DirectMessage[],
  b: DirectMessage[],
): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export class DirectMessageNexus extends Nexus<
  DirectMessageConversationSummary,
  DirectMessageConversationSummary
> {
  private _dmStore:
    | UseBoundStore<StoreApi<DirectMessageNexusState>>
    | null = null

  private readonly backend: DirectMessageBackend
  private conversationsInflight: Promise<void> | null = null
  private messagesInflight = new Map<string, Promise<void>>()

  private conversationsSnapshot: DirectMessageConversationSummary[] =
    EMPTY_CONVERSATIONS
  private messageSnapshots = new Map<string, DirectMessage[]>()

  private readonly conversationsSelector = (
    state: DirectMessageNexusState,
  ): DirectMessageConversationSummary[] => {
    void state.revision
    if (state.conversationIds.length === 0) return EMPTY_CONVERSATIONS
    const list = state.conversationIds
      .map((id) => state.entities[id]?.data)
      .filter((c): c is DirectMessageConversationSummary => c !== undefined)
    if (conversationsEqual(this.conversationsSnapshot, list)) {
      return this.conversationsSnapshot
    }
    this.conversationsSnapshot = list
    return list
  }

  private messagesSelectors = new Map<
    string,
    (state: DirectMessageNexusState) => DirectMessage[]
  >()

  constructor(persistence: NexusPersistence, backend: DirectMessageBackend) {
    super('direct-messages', 'global', persistence)
    this.backend = backend
  }

  /** Test-only access to the underlying store. Production code should use the `use*` hooks. */
  getReactiveStore(): UseBoundStore<StoreApi<DirectMessageNexusState>> {
    return this.store
  }

  protected transform(
    raw: DirectMessageConversationSummary,
  ): DirectMessageConversationSummary {
    return raw
  }

  protected override get store(): UseBoundStore<
    StoreApi<DirectMessageNexusState>
  > {
    if (!this._dmStore) {
      this._dmStore = create<DirectMessageNexusState>(() => ({
        entities: {},
        conversationIds: [],
        messagesByConversation: {},
        messageEntities: {},
        hasMoreByConversation: {},
        activeConversationId: null,
        isLoadingConversations: false,
        loadingByConversation: {},
        messagesLoadComplete: {},
        messagesLastLoadedAt: {},
        composeDraftPeer: null,
        revision: 0,
      }))
      this.rehydrate()
    }
    return this._dmStore
  }

  // ---- Load methods ----

  async loadConversations(): Promise<void> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.loadConversations called before backend attached.')
    }
    if (this.conversationsInflight) return this.conversationsInflight

    this.conversationsInflight = (async () => {
      this.setIsLoadingConversations(true)
      try {
        const conversations = await this.backend!.listConversations()
        this.setConversations(conversations)
      } finally {
        this.setIsLoadingConversations(false)
      }
    })().finally(() => {
      this.conversationsInflight = null
    })

    return this.conversationsInflight
  }

  async loadMessages(conversationId: string): Promise<void> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.loadMessages called before backend attached.')
    }
    const inflight = this.messagesInflight.get(conversationId)
    if (inflight) return inflight

    const promise = (async () => {
      this.setLoadingForConversation(conversationId, true)
      try {
        const messages = await this.backend!.listMessages({
          conversationId,
          limit: DM_PAGE_SIZE,
        })
        const ascending = [...messages].reverse()
        this.replaceMessages(conversationId, ascending, {
          hasMore: messages.length === DM_PAGE_SIZE,
        })
        this.markMessagesLoadComplete(conversationId)
      } finally {
        this.setLoadingForConversation(conversationId, false)
      }
    })().finally(() => {
      this.messagesInflight.delete(conversationId)
    })

    this.messagesInflight.set(conversationId, promise)
    return promise
  }

  /**
   * Load messages when a conversation is focused. Skips refetch while data is
   * still fresh (default 10s) unless `freshnessMs` is 0.
   */
  async ensureMessagesLoaded(
    conversationId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const freshnessMs = options?.freshnessMs ?? DM_RELOAD_FRESHNESS_WINDOW_MS
    const state = this.store.getState()
    const lastAt = state.messagesLastLoadedAt[conversationId] ?? 0
    if (
      state.messagesLoadComplete[conversationId] &&
      Date.now() - lastAt < freshnessMs
    ) {
      return
    }
    await this.loadMessages(conversationId)
  }

  async openConversation(
    conversationId: string,
    options?: { markRead?: boolean },
  ): Promise<void> {
    this.setComposeDraftPeer(null)
    this.setActiveConversationId(conversationId)
    await this.ensureMessagesLoaded(conversationId, { freshnessMs: 0 })
    if (options?.markRead !== false) {
      await this.markRead(conversationId)
    }
    const conversations = this.store.getState().conversationIds
    if (!conversations.includes(conversationId)) {
      await this.loadConversations()
    }
  }

  async openWithUser(otherUserId: string): Promise<string> {
    const conversationId = await this.getOrCreateDirectConversation(otherUserId)
    await this.openConversation(conversationId, { markRead: true })
    return conversationId
  }

  openDraftWithUser(targetUserId: string, displayName?: string | null): void {
    const state = this.store.getState()
    const existing = state.conversationIds
      .map((id) => state.entities[id]?.data)
      .find((conversation) => conversation?.otherUserId === targetUserId)
    if (existing) {
      void this.openConversation(existing.conversationId, { markRead: true })
      return
    }
    this.setComposeDraftPeer({
      userId: targetUserId,
      displayName: displayName?.trim() || 'Direct',
    })
    this.setActiveConversationId(null)
  }

  async loadOlderMessages(conversationId: string): Promise<void> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.loadOlderMessages called before backend attached.')
    }
    const ids = this.store.getState().messagesByConversation[conversationId] ?? []
    if (ids.length === 0) return
    const oldest = this.store.getState().messageEntities[ids[0]]
    if (!oldest) return
    if (this.store.getState().hasMoreByConversation[conversationId] === false) {
      return
    }

    const messages = await this.backend.listMessages({
      conversationId,
      limit: DM_PAGE_SIZE,
      beforeCreatedAt: oldest.createdAt,
      beforeMessageId: oldest.messageId,
    })
    const ascending = [...messages].reverse()
    this.prependMessages(conversationId, ascending, {
      hasMore: messages.length === DM_PAGE_SIZE,
    })
  }

  async getOrCreateDirectConversation(otherUserId: string): Promise<string> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.getOrCreateDirectConversation called before backend attached.')
    }
    return this.backend.getOrCreateDirectConversation(otherUserId)
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: Parameters<DirectMessageBackend['sendMessage']>[0]['imageUpload'] extends infer T
      ? { imageUpload?: T; metadata?: Record<string, unknown> }
      : never,
  ): Promise<DirectMessage> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.sendMessage called before backend attached.')
    }
    const sent = await this.backend.sendMessage({
      conversationId,
      content,
      metadata: options?.metadata,
      imageUpload: options?.imageUpload,
    })
    this.upsertMessage(sent)
    return sent
  }

  async markRead(conversationId: string): Promise<boolean> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.markRead called before backend attached.')
    }
    const ok = await this.backend.markConversationRead(conversationId)
    if (ok) {
      this.store.setState((state) => {
        const entry = state.entities[conversationId]
        if (!entry) return state
        return {
          ...state,
          entities: {
            ...state.entities,
            [conversationId]: {
              ...entry,
              data: { ...entry.data, unreadCount: 0 },
              cachedAt: Date.now(),
            },
          },
          revision: state.revision + 1,
        }
      })
      this.persist()
    }
    return ok
  }

  async setMuted(conversationId: string, muted: boolean): Promise<boolean> {
    if (!this.backend) {
      throw new Error('DirectMessageNexus.setMuted called before backend attached.')
    }
    return this.backend.setConversationMuted({ conversationId, muted })
  }

  // ---- Mutators ----

  setConversations(conversations: DirectMessageConversationSummary[]): void {
    const entities: Record<string, NexusEntry<DirectMessageConversationSummary>> = {}
    const conversationIds: string[] = []
    for (const conversation of conversations) {
      entities[conversation.conversationId] = {
        data: conversation,
        partial: false,
        cachedAt: Date.now(),
      }
      conversationIds.push(conversation.conversationId)
    }
    this.store.setState((state) => ({
      ...state,
      entities,
      conversationIds,
      isLoadingConversations: false,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  replaceMessages(
    conversationId: string,
    messages: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    this.store.setState((state) => {
      const messageEntities = { ...state.messageEntities }
      const ids: string[] = []
      for (const message of messages) {
        messageEntities[message.messageId] = message
        ids.push(message.messageId)
      }
      return {
        ...state,
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: ids,
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: options.hasMore,
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  prependMessages(
    conversationId: string,
    older: DirectMessage[],
    options: { hasMore: boolean },
  ): void {
    if (older.length === 0) return
    this.store.setState((state) => {
      const messageEntities = { ...state.messageEntities }
      const existing = state.messagesByConversation[conversationId] ?? []
      const olderIds: string[] = []
      for (const message of older) {
        messageEntities[message.messageId] = message
        olderIds.push(message.messageId)
      }
      return {
        ...state,
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...olderIds, ...existing],
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: options.hasMore,
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  upsertMessage(message: DirectMessage): void {
    this.store.setState((state) => {
      const messageEntities = {
        ...state.messageEntities,
        [message.messageId]: message,
      }
      const existing =
        state.messagesByConversation[message.conversationId] ?? []
      const next = existing.includes(message.messageId)
        ? existing
        : [...existing, message.messageId]
      return {
        ...state,
        messageEntities,
        messagesByConversation: {
          ...state.messagesByConversation,
          [message.conversationId]: next,
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  removeMessage(conversationId: string, messageId: string): void {
    this.store.setState((state) => {
      const { [messageId]: _removed, ...rest } = state.messageEntities
      const existing = state.messagesByConversation[conversationId] ?? []
      return {
        ...state,
        messageEntities: rest,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: existing.filter((id) => id !== messageId),
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  setActiveConversationId(id: string | null): void {
    this.store.setState((state) => ({
      ...state,
      activeConversationId: id,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  setComposeDraftPeer(peer: DmComposeDraftPeer | null): void {
    this.store.setState((state) => ({
      ...state,
      composeDraftPeer: peer,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  clearFocusedConversation(): void {
    this.setComposeDraftPeer(null)
    this.setActiveConversationId(null)
  }

  setIsLoadingConversations(loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      isLoadingConversations: loading,
      revision: state.revision + 1,
    }))
  }

  setLoadingForConversation(conversationId: string, loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      loadingByConversation: {
        ...state.loadingByConversation,
        [conversationId]: loading,
      },
      revision: state.revision + 1,
    }))
  }

  /** Apply a single conversation update from a realtime event. */
  updateConversation(
    conversationId: string,
    changes: Partial<DirectMessageConversationSummary>,
  ): void {
    this.store.setState((state) => {
      const entry = state.entities[conversationId]
      if (!entry) return state
      return {
        ...state,
        entities: {
          ...state.entities,
          [conversationId]: {
            ...entry,
            data: { ...entry.data, ...changes },
            cachedAt: Date.now(),
          },
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  // ---- Read selectors ----

  useConversations(): DirectMessageConversationSummary[] {
    return useStoreWithEqualityFn(
      this.store,
      this.conversationsSelector,
      conversationsEqual,
    )
  }

  useActiveConversationId(): string | null {
    return useStoreWithEqualityFn(this.store, selectActiveConversationId)
  }

  useIsLoadingConversations(): boolean {
    return useStoreWithEqualityFn(this.store, selectIsLoadingConversations)
  }

  useMessages(conversationId: string): DirectMessage[] {
    return useStoreWithEqualityFn(
      this.store,
      this.getMessagesSelector(conversationId),
      directMessagesEqual,
    )
  }

  useHasMore(conversationId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.hasMoreByConversation[conversationId] ?? false,
    )
  }

  useIsLoadingMessages(conversationId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.loadingByConversation[conversationId] ?? false,
    )
  }

  useComposeDraftPeer(): DmComposeDraftPeer | null {
    return useStoreWithEqualityFn(this.store, selectComposeDraftPeer)
  }

  useHasMessagesLoadCompleted(conversationId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.messagesLoadComplete[conversationId] ?? false,
    )
  }

  private getMessagesSelector(
    conversationId: string,
  ): (state: DirectMessageNexusState) => DirectMessage[] {
    if (!this.messagesSelectors.has(conversationId)) {
      this.messagesSelectors.set(conversationId, (state) => {
        void state.revision
        const ids = state.messagesByConversation[conversationId] ?? []
        if (ids.length === 0) return EMPTY_MESSAGES
        const list: DirectMessage[] = []
        for (const id of ids) {
          const msg = state.messageEntities[id]
          if (msg) list.push(msg)
        }
        const cached = this.messageSnapshots.get(conversationId)
        if (cached && directMessagesEqual(cached, list)) return cached
        this.messageSnapshots.set(conversationId, list)
        return list
      })
    }
    return this.messagesSelectors.get(conversationId)!
  }

  // ---- Persistence ----

  override persist(): void {
    try {
      const state = this.store.getState()
      const persistable = {
        entities: state.entities,
        conversationIds: state.conversationIds,
        activeConversationId: state.activeConversationId,
        composeDraftPeer: state.composeDraftPeer,
      }
      this.persistence.set(STORAGE_KEY, JSON.stringify(persistable))
    } catch (error) {
      console.warn('[DirectMessageNexus] Failed to persist', error)
    }
  }

  override rehydrate(): void {
    try {
      const raw = this.persistence.getString(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<DirectMessageNexusState>
      this.store.setState((state) => ({
        ...state,
        entities: parsed.entities ?? {},
        conversationIds: parsed.conversationIds ?? [],
        activeConversationId: parsed.activeConversationId ?? null,
        composeDraftPeer: parsed.composeDraftPeer ?? null,
        revision: 0,
      }))
    } catch (error) {
      console.warn('[DirectMessageNexus] Failed to rehydrate', error)
      this.persistence.remove(STORAGE_KEY)
    }
  }

  override clear(): void {
    this.store.setState({
      entities: {},
      conversationIds: [],
      messagesByConversation: {},
      messageEntities: {},
      hasMoreByConversation: {},
      activeConversationId: null,
      isLoadingConversations: false,
      loadingByConversation: {},
      messagesLoadComplete: {},
      messagesLastLoadedAt: {},
      composeDraftPeer: null,
      revision: 0,
    })
    this.conversationsSnapshot = EMPTY_CONVERSATIONS
    this.messagesSelectors.clear()
    this.messageSnapshots.clear()
    this.persistence.remove(STORAGE_KEY)
  }

  async reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string> {
    return this.backend.reportMessage(input);
  }

  private markMessagesLoadComplete(conversationId: string): void {
    this.store.setState((state) => ({
      ...state,
      messagesLoadComplete: {
        ...state.messagesLoadComplete,
        [conversationId]: true,
      },
      messagesLastLoadedAt: {
        ...state.messagesLastLoadedAt,
        [conversationId]: Date.now(),
      },
      revision: state.revision + 1,
    }))
  }
}
