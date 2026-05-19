import { createMMKV } from 'react-native-mmkv'
import { CommunityMessageNexus } from '@shared/nexus/community/CommunityMessageNexus'
import { getCommunityDataBackend } from '@shared/lib/backend'
import { usePermissionsStore } from '@shared/stores/permissionsStore'
import { useNotificationsStore } from '@shared/stores/notificationsStore'
import { useDmStore } from '@shared/stores/dmStore'
import { useSocialStore } from '@shared/stores/socialStore'
import { hydrateCommunityPermissions } from '@shared/features/community/communityPermissionsHydration'

type BusEvent = {
  type: string
  payload: Record<string, unknown>
}

class HavenEventBus {
  private messageNexuses = new Map<string, CommunityMessageNexus>()
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
          createdAt: typeof createdAt === 'string'
            ? createdAt : new Date().toISOString(),
          editedAt: null,
          deletedAt: typeof evt.payload.deleted_at === 'string'
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

        void getCommunityDataBackend(communityId)
          .listChannelMessages({
            communityId,
            channelId,
            limit: 1,
            ...(typeof createdAt === 'string'
              ? { beforeCreatedAt: new Date(
                  new Date(createdAt).getTime() + 1
                ).toISOString() }
              : {}),
          })
          .then(result => {
            const message = result.messages.find(m => m.id === messageId)
            if (message) nexus.updateMessage(messageId, message)
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

        void getCommunityDataBackend(communityId)
          .listChannelMessages({
            communityId,
            channelId,
            limit: 1,
            ...(typeof createdAt === 'string'
              ? { beforeCreatedAt: new Date(
                  new Date(createdAt).getTime() + 1
                ).toISOString() }
              : {}),
          })
          .then(result => {
            const message = result.messages.find(m => m.id === messageId)
            if (message) nexus.updateMessage(messageId, message)
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
