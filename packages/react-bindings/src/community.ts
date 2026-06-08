import { useMemo } from "react";
import type {
  Community,
  CommunityNexus,
} from "@shared/nexus/community/CommunityNexus";
import {
  communitiesEqual,
  projectCommunities,
  selectActiveId,
  selectDisplayOrderIds,
  selectIsLoading,
  selectLoadError,
} from "@shared/nexus/community/communitySelectors";
import { applyCommunityDisplayOrder } from "@shared/core/communityDisplayOrder";
import { useStoreSelector } from "./useStoreSelector";

/**
 * React bindings for CommunityNexus. Thin hooks over the shared projections +
 * equality fns; per-consumer stability comes from the equality fns. Domain-
 * specific names avoid collisions in the `@react-bindings` barrel.
 */

export function useCommunities(nexus: CommunityNexus): Community[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
}

export function useActiveCommunityId(nexus: CommunityNexus): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveId);
}

export function useCommunitiesLoading(nexus: CommunityNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function useCommunitiesLoadError(nexus: CommunityNexus): string | null {
  return useStoreSelector(nexus.reactiveStore, selectLoadError);
}

/**
 * Composed hook: communities reordered by the user's saved display order.
 * Mirrors the old in-class `useOrderedCommunities` — two reactive sources
 * (`projectCommunities` + `selectDisplayOrderIds`) folded through the shared
 * pure `applyCommunityDisplayOrder` projection inside a `useMemo`.
 */
export function useOrderedCommunities(nexus: CommunityNexus): Community[] {
  const communities = useStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
  const displayOrderIds = useStoreSelector(
    nexus.reactiveStore,
    selectDisplayOrderIds,
  );
  return useMemo(
    () => applyCommunityDisplayOrder(communities, displayOrderIds),
    [communities, displayOrderIds],
  );
}
