import { useCallback, useEffect, useState } from 'react'
import { havenEventBus } from '@shared/infrastructure/realtime'
import { getCommunityDataBackend } from '@shared/lib/backend'

export function useMessageNexus(
  communityId: string | null,
  channelId: string | null
) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const nexus = communityId
    ? havenEventBus.getMessageNexus(communityId)
    : null

  const messages = nexus?.useChannel(channelId ?? '') ?? []
  const meta = nexus?.useChannelMeta(channelId ?? '') ?? {
    hasMore: false,
    cursor: null
  }

  useEffect(() => {
    if (!communityId || !channelId || !nexus) return
    setIsInitialized(false)

    getCommunityDataBackend(communityId)
      .listChannelMessages({ communityId, channelId })
      .then(result => {
        nexus.insertMessages(result.messages, channelId, {
          hasMore: result.hasMore,
          cursor: result.messages[0]?.createdAt ?? null
        })
        setIsInitialized(true)
      })
      .catch(err => {
        console.warn('[useMessageNexus] initial load failed', err)
        setIsInitialized(true)
      })
  }, [communityId, channelId])

  const loadOlder = useCallback(async () => {
    if (!communityId || !channelId || !nexus || !meta.hasMore || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      const result = await getCommunityDataBackend(communityId)
        .listChannelMessages({
          communityId,
          channelId,
          beforeCreatedAt: meta.cursor ?? undefined
        })
      nexus.insertMessages(result.messages, channelId, {
        hasMore: result.hasMore,
        cursor: result.messages[0]?.createdAt ?? null
      })
    } catch (err) {
      console.warn('[useMessageNexus] loadOlder failed', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [communityId, channelId, meta.hasMore, meta.cursor, isLoadingOlder])

  return {
    messages,
    hasMore: meta.hasMore,
    isInitialized,
    isLoadingOlder,
    loadOlder,
  }
}
