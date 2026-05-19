import type { MMKV } from 'react-native-mmkv'
import { Nexus, type NexusState } from '../Nexus'
import type { MessageBundle } from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

type CommunityMessageState = {
  byChannel: Record<string, string[]>
  cursors: Record<string, string | null>
  hasMore: Record<string, boolean>
}

export type ChannelMeta = {
  hasMore: boolean
  cursor: string | null
}

const EMPTY_MESSAGES: MessageBundle[] = []
const DEFAULT_CHANNEL_META: ChannelMeta = { hasMore: false, cursor: null }

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
    hasMore: {}
  }

  private channelSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => MessageBundle[]
  >()

  private metaSelectors = new Map<
    string,
    (state: NexusState<MessageBundle>) => ChannelMeta
  >()

  private channelMessageSnapshots = new Map<string, MessageBundle[]>()
  private channelMetaSnapshots = new Map<string, ChannelMeta>()

  constructor(communityId: string, storage: MMKV) {
    super('community-messages', communityId, storage)
  }

  protected transform(raw: MessageBundle): MessageBundle {
    return raw
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
        [channelId]: []
      },
      cursors: {
        ...this.channelState.cursors,
        [channelId]: null
      },
      hasMore: {
        ...this.channelState.hasMore,
        [channelId]: false
      }
    }

    this.persist()
    this.notifyRevision()
  }

  // ---- Public read API (reactive) ----

  useChannel(channelId: string): MessageBundle[] {
    return this.use(this.getChannelSelector(channelId), messagesEqual)
  }

  useChannelMeta(channelId: string): ChannelMeta {
    return this.use(this.getMetaSelector(channelId), channelMetaEqual)
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
    }
    this.channelSelectors.clear()
    this.metaSelectors.clear()
    this.channelMessageSnapshots.clear()
    this.channelMetaSnapshots.clear()
    super.clear()
  }
}
