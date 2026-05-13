import { create } from "zustand";

type SocialStoreData = {
  myBlockedUserIds: string[];
  usersBlockingMeIds: string[];
  blockedUserIds: ReadonlySet<string>;
};

export type SocialStoreState = SocialStoreData & {
  socialRefreshTrigger: number;
  lastSocialPayload: Record<string, unknown> | null;
  setBlockLists: (input: {
    myBlockedUserIds: string[];
    usersBlockingMeIds: string[];
  }) => void;
  addMyBlockedUserId: (userId: string) => void;
  removeMyBlockedUserId: (userId: string) => void;
  addUserBlockingMeId: (userId: string) => void;
  removeUserBlockingMeId: (userId: string) => void;
  triggerSocialRefresh: (payload: Record<string, unknown>) => void;
  reset: () => void;
};

const normalizeUserIds = (userIds: ReadonlyArray<string>): string[] =>
  Array.from(new Set(userIds.filter((userId) => userId.length > 0)));

const addUniqueUserId = (existingUserIds: string[], userId: string): string[] => {
  if (!userId || existingUserIds.includes(userId)) return existingUserIds;
  return [...existingUserIds, userId];
};

const removeUserId = (existingUserIds: string[], userId: string): string[] =>
  existingUserIds.filter((existingUserId) => existingUserId !== userId);

const createBlockedUserIds = (
  myBlockedUserIds: ReadonlyArray<string>,
  usersBlockingMeIds: ReadonlyArray<string>
): ReadonlySet<string> => new Set([...myBlockedUserIds, ...usersBlockingMeIds]);

const createSocialState = (
  myBlockedUserIds: string[],
  usersBlockingMeIds: string[]
): SocialStoreData => {
  const normalizedMyBlockedUserIds = normalizeUserIds(myBlockedUserIds);
  const normalizedUsersBlockingMeIds = normalizeUserIds(usersBlockingMeIds);

  return {
    myBlockedUserIds: normalizedMyBlockedUserIds,
    usersBlockingMeIds: normalizedUsersBlockingMeIds,
    blockedUserIds: createBlockedUserIds(
      normalizedMyBlockedUserIds,
      normalizedUsersBlockingMeIds
    ),
  };
};

const createDefaultSocialState = (): SocialStoreData => createSocialState([], []);

export const useSocialStore = create<SocialStoreState>()((set) => ({
  ...createDefaultSocialState(),
  socialRefreshTrigger: 0,
  lastSocialPayload: null,
  triggerSocialRefresh: (payload) =>
    set((state) => ({
      socialRefreshTrigger: state.socialRefreshTrigger + 1,
      lastSocialPayload: payload,
    })),
  setBlockLists: ({ myBlockedUserIds, usersBlockingMeIds }) =>
    set(createSocialState(myBlockedUserIds, usersBlockingMeIds)),
  addMyBlockedUserId: (userId) =>
    set((state) => {
      const nextMyBlockedUserIds = addUniqueUserId(state.myBlockedUserIds, userId);
      if (nextMyBlockedUserIds === state.myBlockedUserIds) return state;
      return createSocialState(nextMyBlockedUserIds, state.usersBlockingMeIds);
    }),
  removeMyBlockedUserId: (userId) =>
    set((state) => {
      const nextMyBlockedUserIds = removeUserId(state.myBlockedUserIds, userId);
      if (nextMyBlockedUserIds === state.myBlockedUserIds) return state;
      return createSocialState(nextMyBlockedUserIds, state.usersBlockingMeIds);
    }),
  addUserBlockingMeId: (userId) =>
    set((state) => {
      const nextUsersBlockingMeIds = addUniqueUserId(state.usersBlockingMeIds, userId);
      if (nextUsersBlockingMeIds === state.usersBlockingMeIds) return state;
      return createSocialState(state.myBlockedUserIds, nextUsersBlockingMeIds);
    }),
  removeUserBlockingMeId: (userId) =>
    set((state) => {
      const nextUsersBlockingMeIds = removeUserId(state.usersBlockingMeIds, userId);
      if (nextUsersBlockingMeIds === state.usersBlockingMeIds) return state;
      return createSocialState(state.myBlockedUserIds, nextUsersBlockingMeIds);
    }),
  reset: () =>
    set({
      ...createDefaultSocialState(),
      socialRefreshTrigger: 0,
      lastSocialPayload: null,
    }),
}));
