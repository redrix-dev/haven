import type { SocialNexus } from "../social/SocialNexus";
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

export function useCounts(nexus: SocialNexus): SocialCounts {
  return useStoreSelector(nexus.reactiveStore, (state) => state.counts);
}

export function useFriends(nexus: SocialNexus): FriendSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => {
      void state.revision;
      return state.friends;
    },
    friendsEqual,
  );
}

export function useFriendRequests(nexus: SocialNexus): FriendRequestSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => {
      void state.revision;
      return state.requests;
    },
    requestsEqual,
  );
}

export function useBlockedUsers(nexus: SocialNexus): BlockedUserSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => {
      void state.revision;
      return state.blockedUsers;
    },
    blockedEqual,
  );
}

export function useIsLoading(nexus: SocialNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.isLoading);
}
