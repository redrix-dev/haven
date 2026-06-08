import type { CommunityNexusPort } from "@shared/core/cache/entityNexusPorts";
import type { Community } from "@shared/nexus/community/communityTypes";
import { useMemo } from "react";
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

export function useCommunities(nexus: CommunityNexusPort): Community[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
}

export function useActiveCommunityId(nexus: CommunityNexusPort): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveId);
}

export function useCommunitiesLoading(nexus: CommunityNexusPort): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function useCommunitiesLoadError(nexus: CommunityNexusPort): string | null {
  return useStoreSelector(nexus.reactiveStore, selectLoadError);
}

export function useOrderedCommunities(nexus: CommunityNexusPort): Community[] {
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
