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
  UserProfileCard,
} from "@shared/lib/backend/types";
import type { StoreApi, UseBoundStore } from "zustand";

export type ProfileNexusState = {
  profiles: Record<string, LiveProfileIdentity>;
  viewerProfiles: Record<string, UserProfileInfo | null>;
  viewerProfileLoading: Record<string, boolean>;
  viewerProfileErrors: Record<string, string | null>;
  profileCards: Record<string, UserProfileCard | null>;
  profileCardLoading: Record<string, boolean>;
  profileCardErrors: Record<string, string | null>;
  platformStaff: Record<string, PlatformStaffInfo | null>;
  platformStaffLoading: Record<string, boolean>;
  platformStaffErrors: Record<string, string | null>;
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
  private platformStaffInflight = new Map<string, Promise<PlatformStaffInfo | null>>();

  constructor(_persistence: NexusPersistence, controlPlane?: ControlPlaneBackend) {
    void _persistence;
    this.controlPlane = controlPlane ?? null;
    this.store = create<ProfileNexusState>()(() => ({
      profiles: {},
      viewerProfiles: {},
      viewerProfileLoading: {},
      viewerProfileErrors: {},
      profileCards: {},
      profileCardLoading: {},
      profileCardErrors: {},
      platformStaff: {},
      platformStaffLoading: {},
      platformStaffErrors: {},
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
        details: { bio: profile.profileBio },
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

  async updateViewerProfile(input: ViewerProfileUpdateInput): Promise<UserProfileInfo> {
    const result = await this.requireControlPlane().updateUserProfile(input);
    this.setViewerProfile(input.userId, result);
    return result;
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
    this.platformStaffInflight.clear();
    this.store.setState({
      profiles: {},
      viewerProfiles: {},
      viewerProfileLoading: {},
      viewerProfileErrors: {},
      profileCards: {},
      profileCardLoading: {},
      profileCardErrors: {},
      platformStaff: {},
      platformStaffLoading: {},
      platformStaffErrors: {},
      revision: 0,
    });
  }
}
