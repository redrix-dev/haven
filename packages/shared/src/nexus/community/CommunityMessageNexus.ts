import { useMemo } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { Nexus, type NexusState } from '../Nexus'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { ViewerMessagePolicyStore } from '@shared/core/viewerMessagePolicy'
import {
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
} from '@shared/core/viewerMessagePolicy'
import {
  projectVisibleChannelMessages,
  projectVisibleChannelMessagesBlockOnly,
} from '@shared/nexus/community/projectVisibleChannelMessages'
import type { CommunityDataBackend } from '@shared/lib/backend/communityDataBackend.interface'
import type { MessageBundle, MessageReportKind, MessageReportTarget } from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

const MESSAGE_PAGE_SIZE = 50
const MESSAGE_RELOAD_FRESHNESS_WINDOW_MS = 10_000

type CommunityMessageState = {
  byChannel: Record<string, string[]>
  cursors: Record<string, string | null>
  hasMore: Record<string, boolean>
  initialLoadComplete: Record<string, boolean>
  loadingInitial: Record<string, boolean>
  loadingOlder: Record<string, boolean>
  lastInitialLoadedAt: Record<string, number>
}

export type SendCommunityMessageMediaOptions = {
  mediaFile?: Blob | File
  mediaArrayBuffer?: ArrayBuffer
  mediaContentType?: string
  mediaFilename?: string
  mediaExpiresInHours?: number
  senderUserId?: string | null
}

export type ChannelMeta = {
  hasMore: boolean
  cursor: string | null
}

const EMPTY_MESSAGES: MessageBundle[] = []
const DEFAULT_CHANNEL_META: ChannelMeta = { hasMore: false, cursor: null }

const coerceMediaExpiresInHours = (
  value: number | undefined,
): 1 | 24 | 168 | 720 => {
  if (value === 1 || value === 24 || value === 168 || value === 720) return value
  return 24
}

export const messagesEqual = (a: MessageBundle[], b: MessageBundle[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const channelMetaEqual = (a: ChannelMeta, b: ChannelMeta): boolean =>
  a.hasMore === b.hasMore && a.cursor === b.cursor

export class CommunityMessageNexus extends Nexus<MessageBundle, MessageBundle> {
  private channelState: CommunityMessageState = {
    byChannel: {},
    cursors: {},
    hasMore: {},
    initialLoadComplete: {},
    loadingInitial: {},
    loadingOlder: {},
    lastInitialLoadedAt: {},
  }

  private channelSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => MessageBundle[]
  >()

  private metaSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => ChannelMeta
  >()

  private loadingInitialSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => boolean
  >()

  private loadingOlderSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => boolean
  >()

  private initialLoadCompleteSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => boolean
  >()

  private channelMessageSnapshots = new Map<string, MessageBundle[]>()
  private channelMetaSnapshots = new Map<string, ChannelMeta>()

  private communityData: CommunityDataBackend | null = null
  private initialLoadInflight = new Map<string, Promise<void>>()
  private olderLoadInflight = new Map<string, Promise<void>>()

  constructor(
    private readonly communityId: string,
    persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore | null = null,
  ) {
    super('community-messages', communityId, persistence)
  }

  /**
   * Wire the backend. Called by MessageNexusRegistry when this nexus is
   * created so loadInitial / loadOlder / send / edit / delete / react work.
   */
  setCommunityData(communityData: CommunityDataBackend): void {
    this.communityData = communityData
  }

  isCommunityDataAttached(): boolean {
    return this.communityData !== null
  }

  protected transform(raw: MessageBundle): MessageBundle {
    return raw
  }

  // ---- Data orchestration ----

  /**
   * Initial page for a channel. Idempotent and deduplicates concurrent calls.
   */
  async loadInitial(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.loadInitial called before backend attached.')
    }
    const inflight = this.initialLoadInflight.get(channelId)
    if (inflight) return inflight

    this.setLoadingInitial(channelId, true)
    const promise = (async () => {
      const result = await this.communityData!.listChannelMessages({
        communityId: this.communityId,
        channelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: null,
        beforeMessageId: null,
      })
      const ascending = [...result.messages].reverse()
      this.insertMessages(ascending, channelId, {
        hasMore: result.hasMore,
        cursor:
          ascending.length > 0
            ? `${ascending[0].createdAt}|${ascending[0].id}`
            : null,
      })
      this.markInitialLoadComplete(channelId)
    })().finally(() => {
      this.initialLoadInflight.delete(channelId)
      this.setLoadingInitial(channelId, false)
    })

    this.initialLoadInflight.set(channelId, promise)
    return promise
  }

  /**
   * Load initial messages when the channel is focused. Skips refetch while
   * data is still fresh (default 10s) unless `freshnessMs` is 0.
   */
  async ensureInitialLoaded(
    channelId: string,
    options?: { freshnessMs?: number },
  ): Promise<void> {
    const freshnessMs = options?.freshnessMs ?? MESSAGE_RELOAD_FRESHNESS_WINDOW_MS
    const lastAt = this.channelState.lastInitialLoadedAt[channelId] ?? 0
    if (
      this.channelState.initialLoadComplete[channelId] &&
      Date.now() - lastAt < freshnessMs
    ) {
      return
    }
    await this.loadInitial(channelId)
  }

  /**
   * Prepend the next page of older messages for a channel.
   */
  async loadOlder(channelId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.loadOlder called before backend attached.')
    }
    const inflight = this.olderLoadInflight.get(channelId)
    if (inflight) return inflight

    const meta = this.getChannelMetaSnapshot(channelId)
    if (!meta.hasMore) return
    const ids = this.channelState.byChannel[channelId] ?? []
    const oldestId = ids[0]
    const oldest = oldestId ? this.getSnapshot(oldestId) : undefined
    if (!oldest) return

    this.setLoadingOlder(channelId, true)
    const promise = (async () => {
      const result = await this.communityData!.listChannelMessages({
        communityId: this.communityId,
        channelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: oldest.createdAt,
        beforeMessageId: oldest.id,
      })
      const ascending = [...result.messages].reverse()
      this.insertMessages(ascending, channelId, {
        hasMore: result.hasMore,
        cursor:
          ascending.length > 0
            ? `${ascending[0].createdAt}|${ascending[0].id}`
            : meta.cursor,
      })
    })().finally(() => {
      this.olderLoadInflight.delete(channelId)
      this.setLoadingOlder(channelId, false)
    })

    this.olderLoadInflight.set(channelId, promise)
    return promise
  }

  async send(
    channelId: string,
    content: string,
    options?: { replyToMessageId?: string | null; senderUserId?: string | null },
  ): Promise<{ id: string }> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.send called before backend attached.')
    }
    const result = await this.communityData.sendUserMessage({
      communityId: this.communityId,
      channelId,
      content,
      replyToMessageId: options?.replyToMessageId ?? null,
    })
    // Optimistically insert the sent message immediately so it appears in the
    // UI without waiting for the realtime MESSAGE_INSERT event. The event
    // handler will deduplicate the insert and then enrich the entry via
    // updateMessage once the full bundle is fetched.
    this.insertMessage({
      id: result.id,
      channelId,
      authorUserId: options?.senderUserId ?? null,
      displayName: '…',
      avatarSnapshotUrl: null,
      content,
      metadata: {},
      replyToMessageId: options?.replyToMessageId ?? null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      isHidden: false,
      isPlatformStaff: false,
      reactions: [],
      attachment: null,
      linkPreview: null,
    })
    return result
  }

  async sendWithMedia(
    channelId: string,
    content: string,
    options?: { replyToMessageId?: string | null } & SendCommunityMessageMediaOptions,
  ): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.sendWithMedia called before backend attached.')
    }

    const hasBlob = options?.mediaFile != null
    const hasBuffer = options?.mediaArrayBuffer != null
    if (hasBlob && hasBuffer) {
      throw new Error('Cannot send both mediaFile and mediaArrayBuffer.')
    }
    if (hasBuffer && !options.mediaContentType?.trim()) {
      throw new Error('mediaContentType is required when sending mediaArrayBuffer.')
    }

    if (!hasBlob && !hasBuffer) {
      await this.send(channelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        senderUserId: options?.senderUserId ?? null,
      })
      return
    }

    const inferredMediaFilename =
      options?.mediaFilename ??
      (options?.mediaFile && 'name' in options.mediaFile
        ? String(options.mediaFile.name)
        : undefined) ??
      `upload-${Date.now()}`

    const fileBody = hasBuffer
      ? (options!.mediaArrayBuffer as ArrayBuffer)
      : (options!.mediaFile as Blob)

    const upload = await this.communityData.uploadMessageMedia({
      communityId: this.communityId,
      channelId,
      file: fileBody,
      filename: inferredMediaFilename,
      mimeType:
        options?.mediaContentType?.trim() ??
        (options?.mediaFile instanceof Blob
          ? options.mediaFile.type || 'application/octet-stream'
          : 'application/octet-stream'),
      expiresInHours: coerceMediaExpiresInHours(options?.mediaExpiresInHours),
      contentType:
        options?.mediaContentType?.trim() ??
        (options?.mediaFile instanceof Blob
          ? options.mediaFile.type || undefined
          : undefined),
    })

    const { id } = await this.send(channelId, content, {
      replyToMessageId: options?.replyToMessageId ?? null,
      senderUserId: options?.senderUserId ?? null,
    })

    try {
      await this.communityData.insertMessageAttachment({
        messageId: id,
        communityId: this.communityId,
        channelId,
        objectPath: upload.objectPath,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        mediaKind: upload.mediaKind,
        filename: inferredMediaFilename,
        expiresAt: upload.expiresAt,
      })
    } catch (error) {
      // Remove the optimistic local insert since the message will be deleted
      // from the DB. Supabase won't echo MESSAGE_DELETE back to the sender.
      this.removeMessage(id, channelId)
      await this.deleteMessageRpc(id)
      throw error
    }
  }

  async requestLinkPreviewBackfill(channelId: string, messageIds: string[]): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        'CommunityMessageNexus.requestLinkPreviewBackfill called before backend attached.',
      )
    }
    await this.communityData.requestChannelLinkPreviewBackfill({
      communityId: this.communityId,
      channelId,
      messageIds,
    })
  }

  async edit(messageId: string, content: string): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.edit called before backend attached.')
    }
    await this.communityData.editUserMessage({
      communityId: this.communityId,
      messageId,
      content,
    })
  }

  async deleteMessageRpc(messageId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.deleteMessageRpc called before backend attached.')
    }
    await this.communityData.deleteMessage({
      communityId: this.communityId,
      messageId,
    })
  }

  async toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.toggleReaction called before backend attached.')
    }
    await this.communityData.toggleMessageReaction({
      communityId: this.communityId,
      channelId,
      messageId,
      emoji,
    })
  }

  async report(input: {
    channelId: string
    messageId: string
    reporterUserId: string
    target: MessageReportTarget
    kind: MessageReportKind
    comment: string
  }): Promise<void> {
    if (!this.communityData) {
      throw new Error('CommunityMessageNexus.report called before backend attached.')
    }
    await this.communityData.reportMessage({
      communityId: this.communityId,
      ...input,
    })
  }

  private getChannelMetaSnapshot(channelId: string): ChannelMeta {
    return {
      hasMore: this.channelState.hasMore[channelId] ?? false,
      cursor: this.channelState.cursors[channelId] ?? null,
    }
  }

  getReactiveStore(): UseBoundStore<StoreApi<NexusState<MessageBundle>>> {
    return this.store
  }

  getChannelStateSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => MessageBundle[] {
    return this.getChannelSelector(channelId)
  }

  getChannelMetaSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => ChannelMeta {
    return this.getMetaSelector(channelId)
  }

  private getChannelSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => MessageBundle[] {
    if (!this.channelSelectors.has(channelId)) {
      this.channelSelectors.set(channelId, (state) => {
        void state.revision
        const ids = this.channelState.byChannel[channelId]
        if (!ids?.length) return EMPTY_MESSAGES

        const messages: MessageBundle[] = []
        for (const id of ids) {
          const entry = state.entities[id]
          if (entry && !entry.partial) {
            messages.push(entry.data)
          }
        }

        const cached = this.channelMessageSnapshots.get(channelId)
        if (cached && messagesEqual(cached, messages)) {
          return cached
        }

        this.channelMessageSnapshots.set(channelId, messages)
        return messages
      })
    }
    return this.channelSelectors.get(channelId)!
  }

  private getMetaSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => ChannelMeta {
    if (!this.metaSelectors.has(channelId)) {
      this.metaSelectors.set(channelId, (state) => {
        void state.revision
        const hasMore = this.channelState.hasMore[channelId]
        const cursor = this.channelState.cursors[channelId]
        if (hasMore === undefined && cursor === undefined) {
          return DEFAULT_CHANNEL_META
        }
        const next: ChannelMeta = {
          hasMore: hasMore ?? false,
          cursor: cursor ?? null,
        }
        const cached = this.channelMetaSnapshots.get(channelId)
        if (cached && channelMetaEqual(cached, next)) {
          return cached
        }
        this.channelMetaSnapshots.set(channelId, next)
        return next
      })
    }
    return this.metaSelectors.get(channelId)!
  }

  // ---- Private channel index helpers ----

  private insertIntoChannel(message: MessageBundle): void {
    const channelId = message.channelId
    const existing = this.channelState.byChannel[channelId] ?? []

    if (existing.includes(message.id)) return

    const insertAt = existing.findIndex(id => {
      const entry = this.getSnapshot(id)
      if (!entry) return false
      return entry.createdAt > message.createdAt
    })

    const updated = [...existing]
    if (insertAt === -1) {
      updated.push(message.id)
    } else {
      updated.splice(insertAt, 0, message.id)
    }

    this.channelState = {
      ...this.channelState,
      byChannel: {
        ...this.channelState.byChannel,
        [channelId]: updated
      }
    }
  }

  private removeFromChannel(messageId: string, channelId: string): void {
    const existing = this.channelState.byChannel[channelId] ?? []
    this.channelState = {
      ...this.channelState,
      byChannel: {
        ...this.channelState.byChannel,
        [channelId]: existing.filter(id => id !== messageId)
      }
    }
  }

  // ---- Public write API ----

  insertMessage(message: MessageBundle): void {
    this.getOrCreate(message.id, message)
    this.insertIntoChannel(message)
    this.persist()
    this.notifyRevision()
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    options: { hasMore: boolean; cursor: string | null }
  ): void {
    this.store.setState((state) => {
      const next = { ...state.entities }
      for (const message of messages) {
        if (!next[message.id] || next[message.id].partial) {
          next[message.id] = {
            data: this.transform(message),
            partial: false,
            cachedAt: Date.now(),
          }
        }
      }
      return { entities: next }
    })

    for (const message of messages) {
      this.insertIntoChannel(message)
    }

    this.channelState = {
      ...this.channelState,
      cursors: {
        ...this.channelState.cursors,
        [channelId]: options.cursor
      },
      hasMore: {
        ...this.channelState.hasMore,
        [channelId]: options.hasMore
      }
    }

    this.persist()
    this.notifyRevision()
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    this.update(messageId, changes)
    this.persist()
    this.notifyRevision()
  }

  removeMessage(messageId: string, channelId: string): void {
    this.removeFromChannel(messageId, channelId)
    this.evict(messageId)
    this.notifyRevision()
  }

  evictChannel(channelId: string): void {
    const ids = this.channelState.byChannel[channelId] ?? []
    for (const id of ids) {
      this.delete(id)
    }

    this.channelState = {
      ...this.channelState,
      byChannel: {
        ...this.channelState.byChannel,
        [channelId]: [],
      },
      cursors: {
        ...this.channelState.cursors,
        [channelId]: null,
      },
      hasMore: {
        ...this.channelState.hasMore,
        [channelId]: false,
      },
      initialLoadComplete: {
        ...this.channelState.initialLoadComplete,
        [channelId]: false,
      },
      loadingInitial: {
        ...this.channelState.loadingInitial,
        [channelId]: false,
      },
      loadingOlder: {
        ...this.channelState.loadingOlder,
        [channelId]: false,
      },
      lastInitialLoadedAt: {
        ...this.channelState.lastInitialLoadedAt,
        [channelId]: 0,
      },
    }

    this.persist()
    this.notifyRevision()
  }

  // ---- Public read API (reactive) ----

  useChannel(channelId: string): MessageBundle[] {
    return this.use(this.getChannelSelector(channelId), messagesEqual)
  }

  useVisibleChannel(channelId: string): MessageBundle[] {
    const raw = this.useChannel(channelId)
    const hiddenAuthorIds = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.hiddenAuthorIds,
          viewerPolicyHiddenAuthorIdsEqual,
        )
      : null
    const showHiddenMessages = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.showHiddenMessages,
        )
      : false
    const communityPolicy = this.viewerMessagePolicyStore
      ? useStoreWithEqualityFn(
          this.viewerMessagePolicyStore,
          (state) => state.communities[this.communityId],
          viewerCommunityPolicyEqual,
        )
      : undefined

    return useMemo(() => {
      if (!this.viewerMessagePolicyStore) {
        return projectVisibleChannelMessagesBlockOnly(raw, new Set<string>())
      }
      const policy = {
        hiddenAuthorIds: hiddenAuthorIds ?? new Set<string>(),
        showHiddenMessages,
        communities: communityPolicy
          ? { [this.communityId]: communityPolicy }
          : {},
      }
      if (Object.keys(policy.communities).length === 0) {
        return projectVisibleChannelMessagesBlockOnly(raw, policy.hiddenAuthorIds)
      }
      return projectVisibleChannelMessages(raw, policy, {
        communityId: this.communityId,
        channelId,
      })
    }, [raw, hiddenAuthorIds, showHiddenMessages, communityPolicy, channelId])
  }

  useChannelMeta(channelId: string): ChannelMeta {
    return this.use(this.getMetaSelector(channelId), channelMetaEqual)
  }

  useIsLoadingInitial(channelId: string): boolean {
    return this.use(this.getLoadingInitialSelector(channelId))
  }

  useIsLoadingOlder(channelId: string): boolean {
    return this.use(this.getLoadingOlderSelector(channelId))
  }

  useHasInitialLoadCompleted(channelId: string): boolean {
    return this.use(this.getInitialLoadCompleteSelector(channelId))
  }

  getLastMessageId(channelId: string): string | null {
    const ids = this.channelState.byChannel[channelId] ?? []
    return ids[ids.length - 1] ?? null
  }

  clear(): void {
    this.channelState = {
      byChannel: {},
      cursors: {},
      hasMore: {},
      initialLoadComplete: {},
      loadingInitial: {},
      loadingOlder: {},
      lastInitialLoadedAt: {},
    }
    this.channelSelectors.clear()
    this.metaSelectors.clear()
    this.loadingInitialSelectors.clear()
    this.loadingOlderSelectors.clear()
    this.initialLoadCompleteSelectors.clear()
    this.channelMessageSnapshots.clear()
    this.channelMetaSnapshots.clear()
    super.clear()
  }

  private setLoadingInitial(channelId: string, loading: boolean): void {
    this.channelState = {
      ...this.channelState,
      loadingInitial: {
        ...this.channelState.loadingInitial,
        [channelId]: loading,
      },
    }
    this.notifyRevision()
  }

  private setLoadingOlder(channelId: string, loading: boolean): void {
    this.channelState = {
      ...this.channelState,
      loadingOlder: {
        ...this.channelState.loadingOlder,
        [channelId]: loading,
      },
    }
    this.notifyRevision()
  }

  private markInitialLoadComplete(channelId: string): void {
    this.channelState = {
      ...this.channelState,
      initialLoadComplete: {
        ...this.channelState.initialLoadComplete,
        [channelId]: true,
      },
      lastInitialLoadedAt: {
        ...this.channelState.lastInitialLoadedAt,
        [channelId]: Date.now(),
      },
    }
    this.notifyRevision()
  }

  private getLoadingInitialSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => boolean {
    if (!this.loadingInitialSelectors.has(channelId)) {
      this.loadingInitialSelectors.set(channelId, (state) => {
        void state.revision
        return this.channelState.loadingInitial[channelId] ?? false
      })
    }
    return this.loadingInitialSelectors.get(channelId)!
  }

  private getLoadingOlderSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => boolean {
    if (!this.loadingOlderSelectors.has(channelId)) {
      this.loadingOlderSelectors.set(channelId, (state) => {
        void state.revision
        return this.channelState.loadingOlder[channelId] ?? false
      })
    }
    return this.loadingOlderSelectors.get(channelId)!
  }

  private getInitialLoadCompleteSelector(
    channelId: string,
  ): (state: NexusState<MessageBundle>) => boolean {
    if (!this.initialLoadCompleteSelectors.has(channelId)) {
      this.initialLoadCompleteSelectors.set(channelId, (state) => {
        void state.revision
        return this.channelState.initialLoadComplete[channelId] ?? false
      })
    }
    return this.initialLoadCompleteSelectors.get(channelId)!
  }
}
