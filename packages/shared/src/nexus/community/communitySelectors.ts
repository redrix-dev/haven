import type { Community, CommunityNexusState } from './communityTypes'

/**
 * Pure, framework-agnostic projections + equality fns for the community store.
 * Single source of truth for "which slice + how to compare", consumed by both
 * `@mobile-data/hooks` and `@solid-bindings`. Memoization lives in the adapters.
 *
 * `applyCommunityDisplayOrder` (the display-order projection used by
 * `useOrderedCommunities`) deliberately stays in `@shared/core/communityDisplayOrder`
 * — it is also used by the non-React mutation path (`setDisplayOrder`).
 */

/** Stable empty array so the no-communities case is referentially constant. */
const EMPTY_COMMUNITIES: Community[] = []

export const projectCommunities = (
  state: CommunityNexusState,
): Community[] => {
  if (state.orderedIds.length === 0) return EMPTY_COMMUNITIES

  return state.orderedIds
    .map((id) => state.entities[id]?.data)
    .filter((community): community is Community => community !== undefined)
}

export const selectActiveId = (state: CommunityNexusState): string | null =>
  state.activeId

export const selectIsLoading = (state: CommunityNexusState): boolean =>
  state.isLoading

export const selectLoadError = (state: CommunityNexusState): string | null =>
  state.loadError

export const selectDisplayOrderIds = (
  state: CommunityNexusState,
): string[] | null => state.displayOrderIds

export const communitiesEqual = (a: Community[], b: Community[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false
  }
  return true
}
