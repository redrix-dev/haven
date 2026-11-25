/** Views over `SocialState`, worked out when read. Both platforms use these. */

import { friendOf } from "@shared/lib/backend/social";
import type { FriendLink, FriendRequest } from "@shared/lib/backend/records";
import type { SocialState } from "./social";

/** The person's friends' ids. */
export function friendIds(state: SocialState, me: string): string[] {
  return Object.values(state.friendships).map((friendship) =>
    friendOf(friendship, me),
  );
}

export function isFriend(
  state: SocialState,
  me: string,
  userId: string,
): boolean {
  return friendIds(state, me).includes(userId);
}

/** Requests waiting for the person's answer, oldest first. */
export function incomingRequests(
  state: SocialState,
  me: string,
): FriendRequest[] {
  return waiting(state).filter((request) => request.recipient_id === me);
}

/** Requests the person sent that are still waiting, oldest first. */
export function outgoingRequests(
  state: SocialState,
  me: string,
): FriendRequest[] {
  return waiting(state).filter((request) => request.sender_id === me);
}

export function isBlocked(state: SocialState, userId: string): boolean {
  return userId in state.blocks;
}

/** Whether a link of the person's own can still be used. */
export const isLinkUsable = (link: FriendLink, now = Date.now()): boolean =>
  Date.parse(link.expires_at) > now &&
  (link.max_uses === null || link.uses < link.max_uses);

/** The person's links that still work, newest first. */
export const usableLinks = (state: SocialState, now = Date.now()) =>
  Object.values(state.friendLinks)
    .filter((link) => isLinkUsable(link, now))
    .sort((a, b) => (a.id < b.id ? 1 : -1));

const waiting = (state: SocialState) =>
  Object.values(state.friendRequests).sort((a, b) => (a.id < b.id ? -1 : 1));
