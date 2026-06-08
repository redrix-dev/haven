import { createMemo, type Accessor } from "solid-js";
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
import { createStoreSelector } from "./fromStore";

/**
 * Solid bindings for CommunityNexus — mirror of `@react-bindings/community`.
 * Same vanilla store + shared projections; the only difference is the framework
 * subscription primitive.
 */

export function createCommunities(
  nexus: CommunityNexus,
): Accessor<Community[]> {
  return createStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
}

export function createActiveCommunityId(
  nexus: CommunityNexus,
): Accessor<string | null> {
  return createStoreSelector(nexus.reactiveStore, selectActiveId);
}

export function createCommunitiesLoading(
  nexus: CommunityNexus,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, selectIsLoading);
}

export function createCommunitiesLoadError(
  nexus: CommunityNexus,
): Accessor<string | null> {
  return createStoreSelector(nexus.reactiveStore, selectLoadError);
}

/**
 * Composed accessor: communities reordered by saved display order. Both reactive
 * sources are read INSIDE the memo so Solid tracks them at access time.
 */
export function createOrderedCommunities(
  nexus: CommunityNexus,
): Accessor<Community[]> {
  const communities = createStoreSelector(
    nexus.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
  const displayOrderIds = createStoreSelector(
    nexus.reactiveStore,
    selectDisplayOrderIds,
  );
  return createMemo(() =>
    applyCommunityDisplayOrder(communities(), displayOrderIds()),
  );
}
