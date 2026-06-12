import type { Accessor } from "solid-js";
import type { CommunityMemberListItem } from "@shared/lib/backend/types";
import { createStoreSelector } from "../fromStore";
import type { CommunityAdminSolidCache } from "./communityAdminSolidCache";

const NO_MEMBERS: CommunityMemberListItem[] = [];

export function createCommunityMembers(
  cache: CommunityAdminSolidCache,
  communityId: Accessor<string>,
): Accessor<CommunityMemberListItem[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => state.membersByCommunity[communityId()] ?? NO_MEMBERS,
  );
}

export function createCommunityMembersLoading(
  cache: CommunityAdminSolidCache,
  communityId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => state.membersLoading[communityId()] ?? false,
  );
}
