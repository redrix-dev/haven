import type { CommunityNexus } from "../communities/CommunityNexus";
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
