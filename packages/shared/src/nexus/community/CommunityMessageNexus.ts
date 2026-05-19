import { MMKV } from 'react-native-mmkv'
import { Nexus } from '../Nexus'
import type { MessageBundle } from '@shared/lib/backend/types'

type CommunityMessageState = {
  byChannel: Record<string, string[]>
  cursors: Record<string, string | null>
  hasMore: Record<string, boolean>
}

type ChannelMessageBundle = MessageBundle & {
  channel_id: string
}

export class CommunityMessageNexus extends Nexus<MessageBundle, MessageBundle> {
  private channelState: CommunityMessageState = {
    byChannel: {},
    cursors: {},
    hasMore: {}
  }

  constructor(communityId: string, storage: MMKV) {
    super('community-messages', communityId, storage)
  }

  protected transform(raw: MessageBundle): MessageBundle {
    return raw
  }

  // ---- Private channel index helpers ----

  private insertIntoChannel(message: MessageBundle): void {
    const channelId = (message as ChannelMessageBundle).channel_id
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
  }

  insertMessages(
    messages: MessageBundle[],
    channelId: string,
    options: { hasMore: boolean; cursor: string | null }
  ): void {
    for (const message of messages) {
      this.getOrCreate(message.id, message)
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
  }

  updateMessage(messageId: string, changes: Partial<MessageBundle>): void {
    this.update(messageId, changes)
    this.persist()
  }

  removeMessage(messageId: string, channelId: string): void {
    this.removeFromChannel(messageId, channelId)
    this.evict(messageId)
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
  }

  // ---- Public read API (reactive) ----

  useChannel(channelId: string): MessageBundle[] {
    const ids = this.use(state =>
      this.channelState.byChannel[channelId] ?? []
    )
    return ids
      .map(id => this.useOne(id))
      .filter((m): m is MessageBundle => m !== undefined)
  }

  useChannelMeta(channelId: string): {
    hasMore: boolean
    cursor: string | null
  } {
    return {
      hasMore: this.channelState.hasMore[channelId] ?? false,
      cursor: this.channelState.cursors[channelId] ?? null
    }
  }

  getLastMessageId(channelId: string): string | null {
    const ids = this.channelState.byChannel[channelId] ?? []
    return ids[ids.length - 1] ?? null
  }
}
