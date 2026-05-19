import { useCallback, useEffect, useState } from 'react'
import { requireHavenCore } from '@shared/core'
import type { MessageBundle } from '@shared/lib/backend/types'

/**
 * @deprecated Thin reader for community messages. Prefer reading from
 * `useHavenCore().messages.for(communityId).useVisibleChannel(channelId)` directly.
 */
export function useMessageNexus(
  communityId: string | null,
  channelId: string | null,
) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const nexus = communityId ? requireHavenCore().messages.for(communityId) : null
  const safeChannelId = channelId ?? '__none__'

  const messages: MessageBundle[] = nexus?.useVisibleChannel(safeChannelId) ?? []
  const meta = nexus?.useChannelMeta(safeChannelId) ?? {
    hasMore: false,
    cursor: null,
  }

  useEffect(() => {
    if (!nexus || !channelId) return
    setIsInitialized(false)
    nexus
      .loadInitial(channelId)
      .then(() => setIsInitialized(true))
      .catch((err) => {
        console.warn('[useMessageNexus] initial load failed', err)
        setIsInitialized(true)
      })
  }, [nexus, channelId])

  const loadOlder = useCallback(async () => {
    if (!nexus || !channelId || !meta.hasMore || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      await nexus.loadOlder(channelId)
    } catch (err) {
      console.warn('[useMessageNexus] loadOlder failed', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [nexus, channelId, meta.hasMore, isLoadingOlder])

  return {
    messages,
    hasMore: meta.hasMore,
    isInitialized,
    isLoadingOlder,
    loadOlder,
  }
}
