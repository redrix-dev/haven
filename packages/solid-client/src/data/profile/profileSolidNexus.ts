import { createStore, type SetStoreFunction } from "solid-js/store";
import type {
  LiveProfileIdentity,
  UserFlairGrant,
  UserProfileCard,
} from "@shared/lib/backend/types";
import type {
  ControlPlaneBackend,
  PlatformStaffInfo,
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
  profileCards: Record<string, UserProfileCard | null>;
  profileCardLoading: Record<string, boolean>;
  profileCardErrors: Record<string, string | null>;
  userFlairGrants: Record<string, UserFlairGrant[]>;
  userFlairGrantLoading: Record<string, boolean>;
  userFlairGrantErrors: Record<string, string | null>;
  userFlairGrantLastLoadedAt: Record<string, number>;
  platformStaff: Record<string, PlatformStaffInfo | null>;
  platformStaffLoading: Record<string, boolean>;
  platformStaffErrors: Record<string, string | null>;
  platformStaffLastLoadedAt: Record<string, number>;
  revision: number;
};

const initialState = (): ProfileSolidState => ({
  profiles: {},
  viewerProfiles: {},
  viewerProfileLastLoadedAt: {},
  profileCards: {},
  profileCardLoading: {},
  profileCardErrors: {},
  userFlairGrants: {},
  userFlairGrantLoading: {},
  userFlairGrantErrors: {},
  userFlairGrantLastLoadedAt: {},
  platformStaff: {},
  platformStaffLoading: {},
  platformStaffErrors: {},
  platformStaffLastLoadedAt: {},
  revision: 0,
});

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export class ProfileSolidNexus implements RealtimeProfileCache {
  readonly state: ProfileSolidState;
  private readonly setState: SetStoreFunction<ProfileSolidState>;
  private readonly viewerProfileInflight = new Map<
    string,
    Promise<UserProfileInfo | null>
  >();
  private readonly profileCardInflight = new Map<
    string,
    Promise<UserProfileCard | null>
  >();
  private readonly userFlairGrantInflight = new Map<
    string,
    Promise<UserFlairGrant[]>
  >();
  private readonly platformStaffInflight = new Map<
    string,
    Promise<PlatformStaffInfo | null>
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

  profileCard(
    userId: Accessor<string | null>,
  ): Accessor<UserProfileCard | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.profileCards[id] ?? null) : null;
    });
  }

  profileCardLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.profileCardLoading[id] ?? false) : false;
    });
  }

  profileCardError(userId: Accessor<string | null>): Accessor<string | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.profileCardErrors[id] ?? null) : null;
    });
  }

  userFlairs(userId: Accessor<string | null>): Accessor<UserFlairGrant[]> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.userFlairGrants[id] ?? []) : [];
    });
  }

  userFlairsLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.userFlairGrantLoading[id] ?? false) : false;
    });
  }

  userFlairsError(userId: Accessor<string | null>): Accessor<string | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.userFlairGrantErrors[id] ?? null) : null;
    });
  }

  platformStaffInfo(
    userId: Accessor<string | null>,
  ): Accessor<PlatformStaffInfo | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.platformStaff[id] ?? null) : null;
    });
  }

  platformStaffLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.platformStaffLoading[id] ?? false) : false;
    });
  }

  platformStaffError(userId: Accessor<string | null>): Accessor<string | null> {
    return createMemo(() => {
      const id = userId();
      return id ? (this.state.platformStaffErrors[id] ?? null) : null;
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
    this.profileCardInflight.clear();
    this.userFlairGrantInflight.clear();
    this.platformStaffInflight.clear();
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
      this.setProfileCard(userId, {
        userId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        profileVisibility: profile.profileVisibility,
        canViewDetails: true,
        details: { bio: profile.profileBio, activeFlair: profile.activeFlair },
      });
    }
  }

  private setProfileCard(userId: string, card: UserProfileCard | null): void {
    this.setState("profileCards", userId, card);
    if (card) {
      this.upsertProfile({
        userId,
        username: card.username,
        avatarUrl: card.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private setUserFlairGrants(userId: string, grants: UserFlairGrant[]): void {
    this.setState("userFlairGrants", userId, grants);
    this.setState("userFlairGrantLastLoadedAt", userId, Date.now());
  }

  private setPlatformStaff(
    userId: string,
    staff: PlatformStaffInfo | null,
  ): void {
    this.setState("platformStaff", userId, staff);
    this.setState("platformStaffLastLoadedAt", userId, Date.now());
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

  async loadMyUserFlairs(userId: string): Promise<UserFlairGrant[]> {
    if (!userId.trim()) return [];
    const existing = this.userFlairGrantInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      this.setState("userFlairGrantLoading", userId, true);
      this.setState("userFlairGrantErrors", userId, null);
      try {
        const grants = await this.requireControlPlane().listMyUserFlairs();
        this.setUserFlairGrants(userId, grants);
        return grants;
      } catch (error) {
        this.setState(
          "userFlairGrantErrors",
          userId,
          errorMessage(error, "Failed to load flair."),
        );
        throw error;
      } finally {
        this.setState("userFlairGrantLoading", userId, false);
        this.userFlairGrantInflight.delete(userId);
      }
    })();
    this.userFlairGrantInflight.set(userId, promise);
    return promise;
  }

  async ensureMyUserFlairs(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserFlairGrant[]> {
    if (!userId.trim()) return [];
    const inflight = this.userFlairGrantInflight.get(userId);
    if (inflight) return inflight;
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      this.state.userFlairGrants,
      userId,
    );
    const lastLoadedAt = this.state.userFlairGrantLastLoadedAt[userId] ?? 0;
    if (
      hasLoaded &&
      Date.now() - lastLoadedAt < (options?.freshnessMs ?? 60_000)
    ) {
      return this.state.userFlairGrants[userId] ?? [];
    }
    return this.loadMyUserFlairs(userId);
  }

  async setActiveUserFlair(
    userId: string,
    userFlairId: string | null,
  ): Promise<void> {
    if (!userId.trim()) return;
    await this.requireControlPlane().setActiveUserFlair(userFlairId);
    await Promise.all([
      this.loadMyUserFlairs(userId),
      this.loadViewerProfile(userId),
      this.loadProfileCard(userId),
    ]);
  }

  async loadProfileCard(userId: string): Promise<UserProfileCard | null> {
    if (!userId.trim()) return null;
    const existing = this.profileCardInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      this.setState("profileCardLoading", userId, true);
      this.setState("profileCardErrors", userId, null);
      try {
        const card = await this.requireControlPlane().fetchProfileCard(userId);
        this.setProfileCard(userId, card);
        return card;
      } catch (error) {
        this.setState(
          "profileCardErrors",
          userId,
          errorMessage(error, "Failed to load profile card."),
        );
        throw error;
      } finally {
        this.setState("profileCardLoading", userId, false);
        this.profileCardInflight.delete(userId);
      }
    })();
    this.profileCardInflight.set(userId, promise);
    return promise;
  }

  async loadPlatformStaff(userId: string): Promise<PlatformStaffInfo | null> {
    if (!userId.trim()) return null;
    const existing = this.platformStaffInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      this.setState("platformStaffLoading", userId, true);
      this.setState("platformStaffErrors", userId, null);
      try {
        const staff =
          await this.requireControlPlane().fetchPlatformStaff(userId);
        this.setPlatformStaff(userId, staff);
        return staff;
      } catch (error) {
        this.setState(
          "platformStaffErrors",
          userId,
          errorMessage(error, "Failed to load platform staff info."),
        );
        throw error;
      } finally {
        this.setState("platformStaffLoading", userId, false);
        this.platformStaffInflight.delete(userId);
      }
    })();
    this.platformStaffInflight.set(userId, promise);
    return promise;
  }

  async ensurePlatformStaff(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<PlatformStaffInfo | null> {
    if (!userId.trim()) return null;
    const inflight = this.platformStaffInflight.get(userId);
    if (inflight) return inflight;
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      this.state.platformStaff,
      userId,
    );
    const lastLoadedAt = this.state.platformStaffLastLoadedAt[userId] ?? 0;
    if (
      hasLoaded &&
      Date.now() - lastLoadedAt < (options?.freshnessMs ?? 60_000)
    ) {
      return this.state.platformStaff[userId] ?? null;
    }
    return this.loadPlatformStaff(userId);
  }
}
export function createProfileSolidNexus(
  controlPlane?: ControlPlaneBackend,
): ProfileSolidNexus {
  return new ProfileSolidNexus(controlPlane);
}
