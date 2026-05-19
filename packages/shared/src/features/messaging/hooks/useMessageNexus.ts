import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { havenEventBus } from '@shared/infrastructure/realtime'
import { getCommunityDataBackend } from '@shared/lib/backend'
import type { MessageBundle } from '@shared/lib/backend/types'
import type { NexusState } from '@shared/nexus/Nexus'
import {
  channelMetaEqual,
  CommunityMessageNexus,
  messagesEqual,
  type ChannelMeta,
} from '@shared/nexus/community/CommunityMessageNexus'

const NULL_NEXUS_STORE = create<NexusState<MessageBundle>>(() => ({
  entities: {},
  revision: 0,
}))

const selectEmptyMessages = (_state: NexusState<MessageBundle>): MessageBundle[] => []

const selectEmptyMeta = (_state: NexusState<MessageBundle>): ChannelMeta => ({
  hasMore: false,
  cursor: null,
})

function useMessageNexusChannel(
  nexus: CommunityMessageNexus | null,
  channelId: string,
): MessageBundle[] {
  return useStoreWithEqualityFn(
    nexus ? nexus.getReactiveStore() : NULL_NEXUS_STORE,
    nexus ? nexus.getChannelStateSelector(channelId) : selectEmptyMessages,
    messagesEqual,
  )
}

function useMessageNexusMeta(
  nexus: CommunityMessageNexus | null,
  channelId: string,
): ChannelMeta {
  return useStoreWithEqualityFn(
    nexus ? nexus.getReactiveStore() : NULL_NEXUS_STORE,
    nexus ? nexus.getChannelMetaSelector(channelId) : selectEmptyMeta,
    channelMetaEqual,
  )
}

export function useMessageNexus(
  communityId: string | null,
  channelId: string | null
) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const communityMessageNexus = communityId
    ? havenEventBus.getMessageNexus(communityId)
    : null

  const resolvedChannelId = channelId ?? ''
  const messages = useMessageNexusChannel(communityMessageNexus, resolvedChannelId)
  const meta = useMessageNexusMeta(communityMessageNexus, resolvedChannelId)

  useEffect(() => {
    if (!communityId || !channelId || !communityMessageNexus) return
    setIsInitialized(false)

    getCommunityDataBackend(communityId)
      .listChannelMessages({ communityId, channelId })
      .then(result => {
        communityMessageNexus.insertMessages(result.messages, channelId, {
          hasMore: result.hasMore,
          cursor: result.messages[0]?.createdAt ?? null
        })
        setIsInitialized(true)
      })
      .catch(err => {
        console.warn('[useMessageNexus] initial load failed', err)
        setIsInitialized(true)
      })
  }, [communityId, channelId, communityMessageNexus])

  const loadOlder = useCallback(async () => {
    if (!communityId || !channelId || !communityMessageNexus || !meta.hasMore || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      const result = await getCommunityDataBackend(communityId)
        .listChannelMessages({
          communityId,
          channelId,
          beforeCreatedAt: meta.cursor ?? undefined
        })
      communityMessageNexus.insertMessages(result.messages, channelId, {
        hasMore: result.hasMore,
        cursor: result.messages[0]?.createdAt ?? null
      })
    } catch (err) {
      console.warn('[useMessageNexus] loadOlder failed', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [communityId, channelId, communityMessageNexus, meta.hasMore, meta.cursor, isLoadingOlder])

  return {
    messages,
    hasMore: meta.hasMore,
    isInitialized,
    isLoadingOlder,
    loadOlder,
  }
}
