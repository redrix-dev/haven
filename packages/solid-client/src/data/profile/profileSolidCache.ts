import { createStore } from "solid-js/store";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

export type ProfileSolidState = {
  profiles: Record<string, LiveProfileIdentity>;
  revision: number;
};

/** Solid-native profile cache — identity map for realtime + display. */
export class ProfileSolidCache {
  readonly state: ProfileSolidState;
  readonly reactiveStore: NotifyingReadableStore<ProfileSolidState>;
  private readonly setState: (
    updater: (
      state: ProfileSolidState,
    ) => Partial<ProfileSolidState> | ProfileSolidState,
  ) => void;

  constructor() {
    const [state, setState] = createStore<ProfileSolidState>({
      profiles: {},
      revision: 0,
    });
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  getProfile(userId: string): LiveProfileIdentity | undefined {
    return this.state.profiles[userId];
  }

  upsertProfile(profile: LiveProfileIdentity): void {
    this.setState((s) => ({
      profiles: { ...s.profiles, [profile.userId]: profile },
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  removeProfile(userId: string): void {
    if (!this.state.profiles[userId]) return;
    this.setState((s) => {
      const { [userId]: _, ...rest } = s.profiles;
      return { profiles: rest, revision: s.revision + 1 };
    });
    this.reactiveStore.notify();
  }

  clear(): void {
    this.setState(() => ({ profiles: {}, revision: 0 }));
    this.reactiveStore.notify();
  }
}

export function createProfileSolidCache(): ProfileSolidCache {
  return new ProfileSolidCache();
}
