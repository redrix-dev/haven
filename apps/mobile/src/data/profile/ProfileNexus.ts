import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type {
  ControlPlaneBackend,
  PlatformStaffInfo,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  LiveProfileIdentity,
  ProfileVisibility,
  UserFlairGrant,
  UserProfileCard,
} from "@shared/lib/backend/types";
import type { StoreApi, UseBoundStore } from "zustand";

export type ProfileNexusState = {
  profiles: Record<string, LiveProfileIdentity>;
  viewerProfiles: Record<string, UserProfileInfo | null>;
  viewerProfileLoading: Record<string, boolean>;
  viewerProfileErrors: Record<string, string | null>;
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

export type ViewerProfileUpdateInput = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  avatarFile?: Blob | ArrayBuffer | null;
  avatarContentType?: string;
  theme?: string;
  profileVisibility?: ProfileVisibility;
  profileBio?: string | null;
};

export class ProfileNexus {
  private readonly store: UseBoundStore<StoreApi<ProfileNexusState>>;
  private readonly controlPlane: ControlPlaneBackend | null;
  private viewerProfileInflight = new Map<string, Promise<UserProfileInfo | null>>();
  private profileCardInflight = new Map<string, Promise<UserProfileCard | null>>();
  private userFlairGrantInflight = new Map<string, Promise<UserFlairGrant[]>>();
  private platformStaffInflight = new Map<string, Promise<PlatformStaffInfo | null>>();

  constructor(_persistence: NexusPersistence, controlPlane?: ControlPlaneBackend) {
    void _persistence;
    this.controlPlane = controlPlane ?? null;
    this.store = create<ProfileNexusState>()(() => ({
      profiles: {},
      viewerProfiles: {},
      viewerProfileLoading: {},
      viewerProfileErrors: {},
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
    }));
  }

  private requireControlPlane(): ControlPlaneBackend {
    if (!this.controlPlane) {
      throw new Error("ProfileNexus called before controlPlane was attached.");
    }
    return this.controlPlane;
  }

  private setViewerProfile(userId: string, profile: UserProfileInfo | null): void {
    this.store.setState((state) => ({
      viewerProfiles: { ...state.viewerProfiles, [userId]: profile },
      viewerProfileLastLoadedAt: {
        ...state.viewerProfileLastLoadedAt,
        [userId]: Date.now(),
      },
      revision: state.revision + 1,
    }));

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
    this.store.setState((state) => ({
      profileCards: { ...state.profileCards, [userId]: card },
      revision: state.revision + 1,
    }));

    if (card) {
      this.upsertProfile({
        userId,
        username: card.username,
        avatarUrl: card.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private setPlatformStaff(userId: string, staff: PlatformStaffInfo | null): void {
    this.store.setState((state) => ({
      platformStaff: { ...state.platformStaff, [userId]: staff },
      platformStaffLastLoadedAt: {
        ...state.platformStaffLastLoadedAt,
        [userId]: Date.now(),
      },
      revision: state.revision + 1,
    }));
  }

  private setUserFlairGrants(userId: string, grants: UserFlairGrant[]): void {
    this.store.setState((state) => ({
      userFlairGrants: { ...state.userFlairGrants, [userId]: grants },
      userFlairGrantLastLoadedAt: {
        ...state.userFlairGrantLastLoadedAt,
        [userId]: Date.now(),
      },
      revision: state.revision + 1,
    }));
  }

  async loadViewerProfile(userId: string): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    const existing = this.viewerProfileInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      this.store.setState((state) => ({
        viewerProfileLoading: {
          ...state.viewerProfileLoading,
          [userId]: true,
        },
        viewerProfileErrors: {
          ...state.viewerProfileErrors,
          [userId]: null,
        },
        revision: state.revision + 1,
      }));

      try {
        const profile = await this.requireControlPlane().fetchUserProfile(userId);
        this.setViewerProfile(userId, profile);
        return profile;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load profile.";
        this.store.setState((state) => ({
          viewerProfileErrors: {
            ...state.viewerProfileErrors,
            [userId]: message,
          },
          revision: state.revision + 1,
        }));
        throw error;
      } finally {
        this.store.setState((state) => ({
          viewerProfileLoading: {
            ...state.viewerProfileLoading,
            [userId]: false,
          },
          revision: state.revision + 1,
        }));
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
    const existing = this.viewerProfileInflight.get(userId);
    if (existing) return existing;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    const state = this.store.getState();
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      state.viewerProfiles,
      userId,
    );
    const lastLoadedAt = state.viewerProfileLastLoadedAt[userId] ?? 0;
    if (hasLoaded && Date.now() - lastLoadedAt < freshnessMs) {
      return state.viewerProfiles[userId] ?? null;
    }
    return this.loadViewerProfile(userId);
  }

  async updateViewerProfile(input: ViewerProfileUpdateInput): Promise<UserProfileInfo> {
    const result = await this.requireControlPlane().updateUserProfile(input);
    this.setViewerProfile(input.userId, result);
    return result;
  }

  async loadMyUserFlairs(userId: string): Promise<UserFlairGrant[]> {
    if (!userId.trim()) return [];
    const existing = this.userFlairGrantInflight.get(userId);
    if (existing) return existing;

    const promise = (async () => {
      this.store.setState((state) => ({
        userFlairGrantLoading: {
          ...state.userFlairGrantLoading,
          [userId]: true,
        },
        userFlairGrantErrors: {
          ...state.userFlairGrantErrors,
          [userId]: null,
        },
        revision: state.revision + 1,
      }));

      try {
        const grants = await this.requireControlPlane().listMyUserFlairs();
        this.setUserFlairGrants(userId, grants);
        return grants;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load flair.";
        this.store.setState((state) => ({
          userFlairGrantErrors: {
            ...state.userFlairGrantErrors,
            [userId]: message,
          },
          revision: state.revision + 1,
        }));
        throw error;
      } finally {
        this.store.setState((state) => ({
          userFlairGrantLoading: {
            ...state.userFlairGrantLoading,
            [userId]: false,
          },
          revision: state.revision + 1,
        }));
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
    const existing = this.userFlairGrantInflight.get(userId);
    if (existing) return existing;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    const state = this.store.getState();
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      state.userFlairGrants,
      userId,
    );
    const lastLoadedAt = state.userFlairGrantLastLoadedAt[userId] ?? 0;
    if (hasLoaded && Date.now() - lastLoadedAt < freshnessMs) {
      return state.userFlairGrants[userId] ?? [];
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
      this.store.setState((state) => ({
        profileCardLoading: {
          ...state.profileCardLoading,
          [userId]: true,
        },
        profileCardErrors: {
          ...state.profileCardErrors,
          [userId]: null,
        },
        revision: state.revision + 1,
      }));

      try {
        const card = await this.requireControlPlane().fetchProfileCard(userId);
        this.setProfileCard(userId, card);
        return card;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load profile card.";
        this.store.setState((state) => ({
          profileCardErrors: {
            ...state.profileCardErrors,
            [userId]: message,
          },
          revision: state.revision + 1,
        }));
        throw error;
      } finally {
        this.store.setState((state) => ({
          profileCardLoading: {
            ...state.profileCardLoading,
            [userId]: false,
          },
          revision: state.revision + 1,
        }));
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
      this.store.setState((state) => ({
        platformStaffLoading: {
          ...state.platformStaffLoading,
          [userId]: true,
        },
        platformStaffErrors: {
          ...state.platformStaffErrors,
          [userId]: null,
        },
        revision: state.revision + 1,
      }));

      try {
        const staff = await this.requireControlPlane().fetchPlatformStaff(userId);
        this.setPlatformStaff(userId, staff);
        return staff;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load platform staff info.";
        this.store.setState((state) => ({
          platformStaffErrors: {
            ...state.platformStaffErrors,
            [userId]: message,
          },
          revision: state.revision + 1,
        }));
        throw error;
      } finally {
        this.store.setState((state) => ({
          platformStaffLoading: {
            ...state.platformStaffLoading,
            [userId]: false,
          },
          revision: state.revision + 1,
        }));
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
    const existing = this.platformStaffInflight.get(userId);
    if (existing) return existing;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    const state = this.store.getState();
    const hasLoaded = Object.prototype.hasOwnProperty.call(
      state.platformStaff,
      userId,
    );
    const lastLoadedAt = state.platformStaffLastLoadedAt[userId] ?? 0;
    if (hasLoaded && Date.now() - lastLoadedAt < freshnessMs) {
      return state.platformStaff[userId] ?? null;
    }
    return this.loadPlatformStaff(userId);
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

  getProfile(userId: string): LiveProfileIdentity | undefined {
    return this.store.getState().profiles[userId];
  }

  getViewerProfile(userId: string): UserProfileInfo | null | undefined {
    return this.store.getState().viewerProfiles[userId];
  }

  getViewerProfileError(userId: string): string | null {
    return this.store.getState().viewerProfileErrors[userId] ?? null;
  }

  getProfileCard(userId: string): UserProfileCard | null | undefined {
    return this.store.getState().profileCards[userId];
  }

  getProfileCardError(userId: string): string | null {
    return this.store.getState().profileCardErrors[userId] ?? null;
  }

  getUserFlairGrants(userId: string): UserFlairGrant[] {
    return this.store.getState().userFlairGrants[userId] ?? [];
  }

  getUserFlairGrantError(userId: string): string | null {
    return this.store.getState().userFlairGrantErrors[userId] ?? null;
  }

  getPlatformStaff(userId: string): PlatformStaffInfo | null | undefined {
    return this.store.getState().platformStaff[userId];
  }

  getPlatformStaffError(userId: string): string | null {
    return this.store.getState().platformStaffErrors[userId] ?? null;
  }

  useProfilesRecord(): Record<string, LiveProfileIdentity> {
    return useStoreWithEqualityFn(this.store, (state) => {
      void state.revision;
      return state.profiles;
    });
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

  useViewerProfile(userId: string | null | undefined): UserProfileInfo | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.viewerProfiles[userId] ?? null) : null,
    );
  }

  useViewerProfileLoaded(userId: string | null | undefined): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId
        ? Object.prototype.hasOwnProperty.call(state.viewerProfiles, userId)
        : false,
    );
  }

  useViewerProfileLoading(userId: string | null | undefined): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? Boolean(state.viewerProfileLoading[userId]) : false,
    );
  }

  useViewerProfileError(userId: string | null | undefined): string | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.viewerProfileErrors[userId] ?? null) : null,
    );
  }

  useProfileCard(userId: string | null | undefined): UserProfileCard | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.profileCards[userId] ?? null) : null,
    );
  }

  useProfileCardLoading(userId: string | null | undefined): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? Boolean(state.profileCardLoading[userId]) : false,
    );
  }

  useProfileCardError(userId: string | null | undefined): string | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.profileCardErrors[userId] ?? null) : null,
    );
  }

  useUserFlairGrants(userId: string | null | undefined): UserFlairGrant[] {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.userFlairGrants[userId] ?? []) : [],
    );
  }

  useUserFlairGrantLoading(userId: string | null | undefined): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? Boolean(state.userFlairGrantLoading[userId]) : false,
    );
  }

  useUserFlairGrantError(userId: string | null | undefined): string | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.userFlairGrantErrors[userId] ?? null) : null,
    );
  }

  usePlatformStaff(userId: string | null | undefined): PlatformStaffInfo | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.platformStaff[userId] ?? null) : null,
    );
  }

  usePlatformStaffLoading(userId: string | null | undefined): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? Boolean(state.platformStaffLoading[userId]) : false,
    );
  }

  usePlatformStaffError(userId: string | null | undefined): string | null {
    return useStoreWithEqualityFn(this.store, (state) =>
      userId ? (state.platformStaffErrors[userId] ?? null) : null,
    );
  }

  rehydrate(): void {}

  clear(): void {
    this.viewerProfileInflight.clear();
    this.profileCardInflight.clear();
    this.userFlairGrantInflight.clear();
    this.platformStaffInflight.clear();
    this.store.setState({
      profiles: {},
      viewerProfiles: {},
      viewerProfileLoading: {},
      viewerProfileErrors: {},
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
  }
}
