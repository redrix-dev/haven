import { createStore } from "solid-js/store";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";

export type ProfileSolidState = {
  profiles: Record<string, LiveProfileIdentity>;
};

/** Solid-native profile cache stub for typecheck:solid. */
export class ProfileSolidCache {
  private readonly state: ProfileSolidState;

  constructor() {
    const [state] = createStore<ProfileSolidState>({ profiles: {} });
    this.state = state;
  }

  getProfile(userId: string): LiveProfileIdentity | undefined {
    return this.state.profiles[userId];
  }

  upsertProfile(profile: LiveProfileIdentity): void {
    void profile;
    throw new Error("ProfileSolidCache.upsertProfile not implemented yet");
  }

  clear(): void {
    void this.state;
  }
}
