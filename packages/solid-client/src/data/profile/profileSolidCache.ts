import { createStore } from "solid-js/store";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";
import type {
  ControlPlaneBackend,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

export type ViewerProfileUpdateInput = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  theme?: string;
};

export type ProfileSolidState = {
  profiles: Record<string, LiveProfileIdentity>;
  viewerProfiles: Record<string, UserProfileInfo | null>;
  viewerProfileLastLoadedAt: Record<string, number>;
  revision: number;
};

const initialState = (): ProfileSolidState => ({
  profiles: {},
  viewerProfiles: {},
  viewerProfileLastLoadedAt: {},
  revision: 0,
});

/** Solid-native profile cache — identity map for realtime + display, plus the viewer's own profile. */
export class ProfileSolidCache {
  readonly state: ProfileSolidState;
  readonly reactiveStore: NotifyingReadableStore<ProfileSolidState>;
  private readonly setState: (
    updater: (
      state: ProfileSolidState,
    ) => Partial<ProfileSolidState> | ProfileSolidState,
  ) => void;
  private readonly viewerProfileInflight = new Map<
    string,
    Promise<UserProfileInfo | null>
  >();

  constructor(private readonly controlPlane?: ControlPlaneBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  private requireControlPlane(): ControlPlaneBackend {
    if (!this.controlPlane) {
      throw new Error("ProfileSolidCache constructed without controlPlane.");
    }
    return this.controlPlane;
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

  getViewerProfile(userId: string): UserProfileInfo | null {
    return this.state.viewerProfiles[userId] ?? null;
  }

  private setViewerProfile(
    userId: string,
    profile: UserProfileInfo | null,
  ): void {
    this.setState((s) => ({
      viewerProfiles: { ...s.viewerProfiles, [userId]: profile },
      viewerProfileLastLoadedAt: {
        ...s.viewerProfileLastLoadedAt,
        [userId]: Date.now(),
      },
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();

    // Mirror mobile's ProfileNexus: the viewer's identity also feeds the live
    // profiles map, so the viewer's own (optimistic) messages resolve a real
    // name/avatar instead of the "…" snapshot placeholder.
    if (profile) {
      this.upsertProfile({
        userId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async ensureViewerProfile(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    const inflight = this.viewerProfileInflight.get(userId);
    if (inflight) return inflight;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      this.state.viewerProfiles,
      userId,
    );
    const lastLoadedAt = this.state.viewerProfileLastLoadedAt[userId] ?? 0;
    if (hasLoaded && Date.now() - lastLoadedAt < freshnessMs) {
      return this.state.viewerProfiles[userId] ?? null;
    }
    return this.loadViewerProfile(userId);
  }

  async loadViewerProfile(userId: string): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    const existing = this.viewerProfileInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const profile = await this.requireControlPlane().fetchUserProfile(
          userId,
        );
        this.setViewerProfile(userId, profile);
        return profile;
      } finally {
        this.viewerProfileInflight.delete(userId);
      }
    })();

    this.viewerProfileInflight.set(userId, promise);
    return promise;
  }

  async updateViewerProfile(
    input: ViewerProfileUpdateInput,
  ): Promise<UserProfileInfo> {
    const result = await this.requireControlPlane().updateUserProfile(input);
    this.setViewerProfile(input.userId, result);
    return result;
  }

  clear(): void {
    this.viewerProfileInflight.clear();
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }
}

export function createProfileSolidCache(
  controlPlane?: ControlPlaneBackend,
): ProfileSolidCache {
  return new ProfileSolidCache(controlPlane);
}
