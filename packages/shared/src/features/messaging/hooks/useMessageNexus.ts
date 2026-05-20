import { useCallback, useEffect, useState } from 'react'
import { requireHavenCore } from '@shared/core'
import type { MessageBundle } from '@shared/lib/backend/types'

const NO_COMMUNITY = '__none__'

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

  const nexus = requireHavenCore().messages.for(communityId ?? NO_COMMUNITY)
  const safeChannelId = channelId ?? '__none__'

  const messages: MessageBundle[] = nexus.useVisibleChannel(safeChannelId)
  const meta = nexus.useChannelMeta(safeChannelId)

  useEffect(() => {
    if (!communityId || !channelId) return
    setIsInitialized(false)
    nexus
      .loadInitial(channelId)
      .then(() => setIsInitialized(true))
      .catch((err) => {
        console.warn('[useMessageNexus] initial load failed', err)
        setIsInitialized(true)
      })
  }, [communityId, channelId, nexus])

  const loadOlder = useCallback(async () => {
    if (!communityId || !channelId || !meta.hasMore || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      await nexus.loadOlder(channelId)
    } catch (err) {
      console.warn('[useMessageNexus] loadOlder failed', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [communityId, channelId, isLoadingOlder, meta.hasMore, nexus])

  return {
    messages,
    hasMore: meta.hasMore,
    isInitialized,
    isLoadingOlder,
    loadOlder,
  }
}
