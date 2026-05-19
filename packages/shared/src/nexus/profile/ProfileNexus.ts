import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";
import type { StoreApi, UseBoundStore } from "zustand";

export type ProfileNexusState = {
  profiles: Record<string, LiveProfileIdentity>;
  revision: number;
};

export class ProfileNexus {
  private readonly store: UseBoundStore<StoreApi<ProfileNexusState>>;

  constructor(_persistence: NexusPersistence) {
    void _persistence;
    this.store = create<ProfileNexusState>()(() => ({
      profiles: {},
      revision: 0,
    }));
  }

  upsertProfile(profile: LiveProfileIdentity): void {
    this.store.setState((state) => ({
      profiles: { ...state.profiles, [profile.userId]: profile },
      revision: state.revision + 1,
    }));
  }

  upsertProfiles(profiles: LiveProfileIdentity[]): void {
    if (profiles.length === 0) return;
    this.store.setState((state) => {
      const next = { ...state.profiles };
      for (const profile of profiles) {
        next[profile.userId] = profile;
      }
      return { profiles: next, revision: state.revision + 1 };
    });
  }

  removeProfile(userId: string): void {
    this.store.setState((state) => {
      if (!state.profiles[userId]) return state;
      const { [userId]: _removed, ...rest } = state.profiles;
      return { profiles: rest, revision: state.revision + 1 };
    });
  }

  useProfile(userId: string | null | undefined): LiveProfileIdentity | undefined {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? state.profiles[userId] : undefined,
    );
  }

  useProfiles(userIds: readonly string[]): Record<string, LiveProfileIdentity> {
    return useStoreWithEqualityFn(this.store, (state) => {
      void state.revision;
      const result: Record<string, LiveProfileIdentity> = {};
      for (const userId of userIds) {
        const profile = state.profiles[userId];
        if (profile) result[userId] = profile;
      }
      return result;
    });
  }

  rehydrate(): void {}

  clear(): void {
    this.store.setState({ profiles: {}, revision: 0 });
  }
}
