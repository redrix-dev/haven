import type { CommunityReactNexus } from "../communities/communityReactNexus";
import type { Community } from "@shared/nexus/communities/communityTypes";
import { useMemo } from "react";
import {
  communitiesEqual,
  projectCommunities,
  selectActiveId,
  selectDisplayOrderIds,
  selectIsLoading,
  selectLoadError,
} from "@shared/nexus/communities/communitySelectors";
import { applyCommunityDisplayOrder } from "@shared/core/communityDisplayOrder";
import { useStoreSelector } from "./useStoreSelector";

export function useCommunities(nexus: CommunityReactNexus): Community[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
}

export function useActiveCommunityId(
  nexus: CommunityReactNexus,
): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveId);
}

export function useCommunitiesLoading(nexus: CommunityReactNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function useCommunitiesLoadError(
  nexus: CommunityReactNexus,
): string | null {
  return useStoreSelector(nexus.reactiveStore, selectLoadError);
}

export function useOrderedCommunities(nexus: CommunityReactNexus): Community[] {
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
