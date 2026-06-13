import type { Accessor } from "solid-js";
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
import { createStoreSelector } from "../fromStore";
import type { SocialSolidCache } from "./socialSolidCache";

export function createSocialCounts(
  cache: SocialSolidCache,
): Accessor<SocialCounts> {
  return createStoreSelector(cache.reactiveStore, (state) => state.counts);
}

export function createSocialFriends(
  cache: SocialSolidCache,
): Accessor<FriendSummary[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => {
      void state.revision;
      return state.friends;
    },
    friendsEqual,
  );
}

export function createSocialFriendRequests(
  cache: SocialSolidCache,
): Accessor<FriendRequestSummary[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => {
      void state.revision;
      return state.requests;
    },
    requestsEqual,
  );
}

export function createSocialBlockedUsers(
  cache: SocialSolidCache,
): Accessor<BlockedUserSummary[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => {
      void state.revision;
      return state.blockedUsers;
    },
    blockedEqual,
  );
}

export function createSocialLoading(
  cache: SocialSolidCache,
): Accessor<boolean> {
  return createStoreSelector(cache.reactiveStore, (state) => state.isLoading);
}
