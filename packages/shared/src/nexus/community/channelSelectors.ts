import type { ChannelGroupState } from '@shared/lib/backend/types'
import type { ChannelNexusState, HavenChannel } from './ChannelNexus'

/**
 * Pure, framework-agnostic projections + equality fns for the channel store.
 *
 * These are the single source of truth for "which slice of channel state, and
 * how to compare it" — domain knowledge that is meaningful regardless of who is
 * observing. The React (`@react-bindings`) and Solid (`@solid-bindings`)
 * adapters both consume these, so there is exactly one projection per concept.
 *
 * Memoization strategy (useMemo vs createMemo) belongs to the adapters; these
 * functions allocate plainly and rely on the equality fns for per-consumer
 * render stability. (`ChannelNexus.getChannelsSnapshot` already returns fresh
 * arrays on every imperative call, so no caller depends on cross-call identity.)
 */

/** Stable empty array so the no-channels case is referentially constant. */
const EMPTY_CHANNELS: HavenChannel[] = []

export const projectChannels = (
  state: ChannelNexusState,
  communityId: string,
): HavenChannel[] => {
  const ids = state.byCommunity[communityId]
  if (!ids?.length) return EMPTY_CHANNELS

  const channels: HavenChannel[] = []
  for (const id of ids) {
    const entry = state.entities[id]
    if (entry && !entry.partial) {
      channels.push(entry.data)
    }
  }
  return channels
}

export const projectChannelGroups = (
  state: ChannelNexusState,
  communityId: string,
): ChannelGroupState => ({
  groups: state.groups[communityId] ?? [],
  ungroupedChannelIds: state.ungrouped[communityId] ?? [],
  collapsedGroupIds: state.collapsed[communityId] ?? [],
})

export const selectActiveChannelId = (state: ChannelNexusState): string | null =>
  state.activeChannelId

export const selectChannelLoading = (
  state: ChannelNexusState,
  communityId: string,
): boolean => state.loadingByCommunity[communityId] ?? false

export const channelsEqual = (
  a: HavenChannel[],
  b: HavenChannel[],
): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].name !== b[i].name ||
      a[i].position !== b[i].position
    ) {
      return false
    }
  }
  return true
}

export const groupStateEqual = (
  a: ChannelGroupState,
  b: ChannelGroupState,
): boolean =>
  a.groups.length === b.groups.length &&
  a.ungroupedChannelIds.length === b.ungroupedChannelIds.length &&
  a.collapsedGroupIds.length === b.collapsedGroupIds.length
