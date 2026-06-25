import { createStore, type SetStoreFunction } from "solid-js/store";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";
import type {
  ControlPlaneBackend,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import type { RealtimeProfileCache } from "@shared/core/realtimeMutationTarget";
import { createMemo, type Accessor } from "solid-js";
import type { LiveProfilesRecord } from "@shared/lib/liveProfiles";

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

export class ProfileSolidNexus implements RealtimeProfileCache {
  readonly state: ProfileSolidState;
  private readonly setState: SetStoreFunction<ProfileSolidState>;
  private readonly viewerProfileInflight = new Map<
    string,
    Promise<UserProfileInfo | null>
  >();
  constructor(private readonly controlPlane?: ControlPlaneBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  liveProfiles(): Accessor<LiveProfilesRecord> {
    return createMemo(() => this.state.profiles);
  }
  viewerProfile(
    userId: Accessor<string | null>,
  ): Accessor<UserProfileInfo | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.viewerProfiles[id] ?? null) : null;
    });
  }

  upsertProfile(profile: LiveProfileIdentity): void {
    this.setState("profiles", profile.userId, profile);
  }

  removeProfile(userId: string): void {
    this.setState("profiles", userId, undefined!);
  }

  getViewerProfile(userId: string): UserProfileInfo | null {
    return this.state.viewerProfiles[userId] ?? null;
  }

  getProfile(userId: string): LiveProfileIdentity | undefined {
    return this.state.profiles[userId];
  }

  clear(): void {
    this.viewerProfileInflight.clear();
    this.setState(initialState());
  }

  private requireControlPlane(): ControlPlaneBackend {
    if (!this.controlPlane) {
      throw new Error("Control plane is not available");
    }
    return this.controlPlane;
  }

  private setViewerProfile(
    userId: string,
    profile: UserProfileInfo | null,
  ): void {
    this.setState("viewerProfiles", userId, profile);
    this.setState("viewerProfileLastLoadedAt", userId, Date.now());
    if (profile) {
      this.upsertProfile({
        userId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async loadViewerProfile(userId: string): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    const existing = this.viewerProfileInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const profile =
          await this.requireControlPlane().fetchUserProfile(userId);
        this.setViewerProfile(userId, profile);
        return profile;
      } finally {
        this.viewerProfileInflight.delete(userId);
      }
    })();

    this.viewerProfileInflight.set(userId, promise);
    return promise;
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

  async updateViewerProfile(
    input: ViewerProfileUpdateInput,
  ): Promise<UserProfileInfo> {
    const result = await this.requireControlPlane().updateUserProfile(input);
    this.setViewerProfile(input.userId, result);
    return result;
  }
}
export function createProfileSolidNexus(
  controlPlane?: ControlPlaneBackend,
): ProfileSolidNexus {
  return new ProfileSolidNexus(controlPlane);
}
