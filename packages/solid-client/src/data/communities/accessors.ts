import type { Accessor } from "solid-js";
import type { Community } from "@shared/nexus/community/communityTypes";
import {
  communitiesEqual,
  projectCommunities,
  selectActiveId,
  selectDisplayOrderIds,
} from "@shared/nexus/community/communitySelectors";
import { applyCommunityDisplayOrder } from "@shared/core/communityDisplayOrder";
import { createMemo } from "solid-js";
import { createStoreSelector } from "../fromStore";
import type { CommunitySolidCache } from "./communitySolidCache";

export function createCommunities(
  cache: CommunitySolidCache,
): Accessor<Community[]> {
  return createStoreSelector(
    cache.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
}

export function createActiveCommunityId(
  cache: CommunitySolidCache,
): Accessor<string | null> {
  return createStoreSelector(cache.reactiveStore, selectActiveId);
}

export function createOrderedCommunities(
  cache: CommunitySolidCache,
): Accessor<Community[]> {
  const communities = createStoreSelector(
    cache.reactiveStore,
    projectCommunities,
    communitiesEqual,
  );
  const displayOrderIds = createStoreSelector(
    cache.reactiveStore,
    selectDisplayOrderIds,
  );
  return createMemo(() =>
    applyCommunityDisplayOrder(communities(), displayOrderIds()),
  );
}
