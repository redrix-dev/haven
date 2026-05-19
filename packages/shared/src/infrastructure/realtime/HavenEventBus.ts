import { createMMKV } from 'react-native-mmkv'
import { CommunityMessageNexus } from '@shared/nexus/community/CommunityMessageNexus'
import { communityNexus } from '@shared/nexus/community/CommunityNexus'
import { getCommunityDataBackend } from '@shared/lib/backend'
import { usePermissionsStore } from '@shared/stores/permissionsStore'
import { useNotificationsStore } from '@shared/stores/notificationsStore'
import { useDmStore } from '@shared/stores/dmStore'
import { useSocialStore } from '@shared/stores/socialStore'
import { hydrateCommunityPermissions } from '@shared/features/community/communityPermissionsHydration'
import type { MessageBundle } from '@shared/lib/backend/types'

type BusEvent = {
  type: string
  payload: Record<string, unknown>
}

export type MessageSyncEvent = {
  type: 'MESSAGE_INSERT' | 'MESSAGE_UPDATE' | 'MESSAGE_DELETE'
  communityId: string
  channelId: string
  messageId: string
  message?: MessageBundle
}

type MessageSyncListener = (event: MessageSyncEvent) => void

const normalizeCreatedAt = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

const createdAtBeforeCursor = (value: unknown): string | undefined => {
  const normalized = normalizeCreatedAt(value)
  if (!normalized) return undefined
  return new Date(Date.parse(normalized) + 1).toISOString()
}

class HavenEventBus {
  private messageNexuses = new Map<string, CommunityMessageNexus>()
  private messageSyncListeners = new Set<MessageSyncListener>()
  private _storage: ReturnType<typeof createMMKV> | null = null

  private get storage() {
    if (!this._storage) {
      this._storage = createMMKV({ id: 'haven-nexus-storage' })
    }
    return this._storage
  }

  getMessageNexus(communityId: string): CommunityMessageNexus {
    if (!this.messageNexuses.has(communityId)) {
      this.messageNexuses.set(
        communityId,
        new CommunityMessageNexus(communityId, this.storage)
      )
    }
    return this.messageNexuses.get(communityId)!
  }

  clearCommunity(communityId: string): void {
    const nexus = this.messageNexuses.get(communityId)
    if (nexus) {
      nexus.clear()
      this.messageNexuses.delete(communityId)
    }
  }

  clearAll(): void {
    for (const [communityId] of this.messageNexuses) {
      this.clearCommunity(communityId)
    }
    communityNexus.clear()
  }

  addMessageSyncListener(listener: MessageSyncListener): () => void {
    this.messageSyncListeners.add(listener)
    return () => {
      this.messageSyncListeners.delete(listener)
    }
  }

  private emitMessageSync(event: MessageSyncEvent): void {
    for (const listener of this.messageSyncListeners) {
      try {
        listener(event)
      } catch (error) {
        console.warn('[HavenEventBus] message sync listener failed', error)
      }
    }
  }

  handle(evt: BusEvent): void {
    switch (evt.type) {

      case 'MESSAGE_INSERT': {
        const communityId = evt.payload.community_id
        const channelId = evt.payload.channel_id
        const messageId = evt.payload.message_id
        const createdAt = evt.payload.created_at
        if (
          typeof communityId !== 'string' ||
          typeof channelId !== 'string' ||
          typeof messageId !== 'string'
        ) return

        const nexus = this.getMessageNexus(communityId)

        const partial = {
          id: messageId,
          channelId,
          authorUserId: typeof evt.payload.author_user_id === 'string'
            ? evt.payload.author_user_id : null,
          content: typeof evt.payload.content === 'string'
            ? evt.payload.content : '',
          metadata: typeof evt.payload.metadata === 'object' && evt.payload.metadata !== null
            ? evt.payload.metadata as Record<string, unknown> : {},
          createdAt: normalizeCreatedAt(createdAt) ?? new Date().toISOString(),
          editedAt: null,
          deletedAt: typeof evt.payload.deleted_at === 'string' && evt.payload.deleted_at.trim()
            ? evt.payload.deleted_at : null,
          isHidden: typeof evt.payload.is_hidden === 'boolean'
            ? evt.payload.is_hidden : false,
          displayName: '…',
          avatarSnapshotUrl: null,
          isPlatformStaff: false,
          replyToMessageId: null,
          reactions: [],
          attachment: null,
          linkPreview: null,
        }

        nexus.insertMessage(partial as never)
        this.emitMessageSync({
          type: 'MESSAGE_INSERT',
          communityId,
          channelId,
          messageId,
          message: partial as never,
        })

        const beforeCreatedAt = createdAtBeforeCursor(createdAt)

        void getCommunityDataBackend(communityId)
          .listChannelMessages({
            communityId,
            channelId,
            limit: 1,
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
          })
          .then(result => {
            const message = result.messages.find(m => m.id === messageId)
            if (!message) return
            nexus.updateMessage(messageId, message)
            this.emitMessageSync({
              type: 'MESSAGE_INSERT',
              communityId,
              channelId,
              messageId,
              message,
            })
          })
          .catch(err => {
            console.warn('[HavenEventBus] MESSAGE_INSERT fetch failed', err)
          })
        return
      }

      case 'MESSAGE_UPDATE': {
        const communityId = evt.payload.community_id
        const channelId = evt.payload.channel_id
        const messageId = evt.payload.message_id
        const createdAt = evt.payload.created_at
        if (
          typeof communityId !== 'string' ||
          typeof channelId !== 'string' ||
          typeof messageId !== 'string'
        ) return

        const nexus = this.getMessageNexus(communityId)

        const beforeCreatedAt = createdAtBeforeCursor(createdAt)

        void getCommunityDataBackend(communityId)
          .listChannelMessages({
            communityId,
            channelId,
            limit: 1,
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
          })
          .then(result => {
            const message = result.messages.find(m => m.id === messageId)
            if (!message) return
            nexus.updateMessage(messageId, message)
            this.emitMessageSync({
              type: 'MESSAGE_UPDATE',
              communityId,
              channelId,
              messageId,
              message,
            })
          })
          .catch(err => {
            console.warn('[HavenEventBus] MESSAGE_UPDATE fetch failed', err)
          })
        return
      }

      case 'MESSAGE_DELETE': {
        const communityId = evt.payload.community_id
        const channelId = evt.payload.channel_id
        const messageId = evt.payload.message_id
        if (
          typeof communityId !== 'string' ||
          typeof channelId !== 'string' ||
          typeof messageId !== 'string'
        ) return

        this.getMessageNexus(communityId).removeMessage(messageId, channelId)
        this.emitMessageSync({
          type: 'MESSAGE_DELETE',
          communityId,
          channelId,
          messageId,
        })
        return
      }

      case 'ROLE_CHANGE': {
        const communityId = evt.payload.community_id
        if (
          typeof communityId !== 'string' ||
          communityId.trim().length === 0
        ) return
        usePermissionsStore.getState().invalidateElevatedForServer(communityId)
        void hydrateCommunityPermissions(communityId)
        return
      }

      case 'NOTIFICATION': {
        useNotificationsStore.getState().triggerInboxRefresh()
        return
      }

      case 'DM_CONVERSATION': {
        useDmStore.getState().triggerConversationsRefresh()
        return
      }

      case 'DM_MESSAGE': {
        const conversationId = evt.payload.conversation_id
        if (typeof conversationId === 'string') {
          useDmStore.getState().triggerMessageRefresh(conversationId)
        }
        useDmStore.getState().triggerConversationsRefresh()
        return
      }

      case 'SOCIAL_CHANGE': {
        useSocialStore.getState().triggerSocialRefresh(evt.payload)
        return
      }

      default: {
        console.log('[HavenEventBus]', evt.type, evt.payload)
      }
    }
  }
}

export const havenEventBus = new HavenEventBus()
