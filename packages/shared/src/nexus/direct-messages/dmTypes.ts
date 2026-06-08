import type { DirectMessage, DirectMessageConversationSummary } from '@shared/lib/backend/types'
import type { NexusState } from '@shared/core/cache/entityTypes'

export type DmComposeDraftPeer = {
  userId: string
  displayName: string
}

export type DirectMessageNexusState = NexusState<DirectMessageConversationSummary> & {
  conversationIds: string[]
  messagesByConversation: Record<string, string[]>
  messageEntities: Record<string, DirectMessage>
  hasMoreByConversation: Record<string, boolean>
  activeConversationId: string | null
  isLoadingConversations: boolean
  conversationsLastLoadedAt: number
  loadingByConversation: Record<string, boolean>
  messagesLoadComplete: Record<string, boolean>
  messagesLastLoadedAt: Record<string, number>
  composeDraftPeer: DmComposeDraftPeer | null
}
