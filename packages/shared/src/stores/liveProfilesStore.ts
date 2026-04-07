import { create } from 'zustand';
import type { LiveProfileIdentity } from '@shared/lib/backend/types';

type LiveProfilesStoreState = {
  profiles: Record<string, LiveProfileIdentity>;
  upsertProfile: (profile: LiveProfileIdentity) => void;
  upsertProfiles: (profiles: LiveProfileIdentity[]) => void;
  removeProfile: (userId: string) => void;
  reset: () => void;
};

const createDefaultState = (): Pick<LiveProfilesStoreState, 'profiles'> => ({
  profiles: {},
});

export const useLiveProfilesStore = create<LiveProfilesStoreState>()((set) => ({
  ...createDefaultState(),
  upsertProfile: (profile) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile.userId]: profile,
      },
    })),
  upsertProfiles: (profiles) =>
    set((state) => {
      if (profiles.length === 0) return state;
      const nextProfiles = { ...state.profiles };
      for (const profile of profiles) {
        nextProfiles[profile.userId] = profile;
      }
      return { profiles: nextProfiles };
    }),
  removeProfile: (userId) =>
    set((state) => {
      if (!state.profiles[userId]) return state;
      const { [userId]: _removed, ...rest } = state.profiles;
      return { profiles: rest };
    }),
  reset: () => set(createDefaultState()),
}));
