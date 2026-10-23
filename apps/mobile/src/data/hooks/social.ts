import type { SocialReactNexus } from "../social/socialReactNexus";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import {
  blockedEqual,
  friendsEqual,
  requestsEqual,
} from "@shared/features/social/logic";
import { useStoreSelector } from "./useStoreSelector";

export function useCounts(nexus: SocialReactNexus): SocialCounts {
  return useStoreSelector(nexus.reactiveStore, (state) => state.counts);
}

export function useFriends(nexus: SocialReactNexus): FriendSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.friends,
    friendsEqual,
  );
}

export function useFriendRequests(
  nexus: SocialReactNexus,
): FriendRequestSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.requests,
    requestsEqual,
  );
}

export function useBlockedUsers(nexus: SocialReactNexus): BlockedUserSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.blockedUsers,
    blockedEqual,
  );
}

export function useIsLoading(nexus: SocialReactNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.isLoading);
}
