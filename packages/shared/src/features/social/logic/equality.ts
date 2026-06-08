import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSummary,
} from "@shared/lib/backend/types";

export const normalizeUserIds = (userIds: ReadonlyArray<string>): string[] =>
  Array.from(new Set(userIds.filter((userId) => userId.length > 0)));

export const unionHiddenAuthorIds = (
  myBlockedUserIds: readonly string[],
  usersBlockingMeIds: readonly string[],
): ReadonlySet<string> =>
  new Set([...myBlockedUserIds, ...usersBlockingMeIds]);

export const friendsEqual = (a: FriendSummary[], b: FriendSummary[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].friendUserId !== b[i].friendUserId) return false;
  }
  return true;
};

export const requestsEqual = (
  a: FriendRequestSummary[],
  b: FriendRequestSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].requestId !== b[i].requestId) return false;
  }
  return true;
};

export const blockedEqual = (
  a: BlockedUserSummary[],
  b: BlockedUserSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].blockedUserId !== b[i].blockedUserId) return false;
  }
  return true;
};
