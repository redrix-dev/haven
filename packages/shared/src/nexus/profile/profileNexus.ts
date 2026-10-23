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
import { messageFromError } from "../kit/errors";
import { createLoadGate, isFresh } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type ProfileState = {
  /** Live identities (name, avatar) for everyone the viewer has seen — the render path prefers these over message snapshots. */
  profiles: Record<string, LiveProfileIdentity>;
  viewerProfiles: Record<string, UserProfileInfo | null>;
  viewerProfileLoading: Record<string, boolean>;
  viewerProfileErrors: Record<string, string | null>;
  viewerProfileLastLoadedAt: Record<string, number>;
  profileCards: Record<string, UserProfileCard | null>;
  profileCardLoading: Record<string, boolean>;
  profileCardErrors: Record<string, string | null>;
  profileCardLastLoadedAt: Record<string, number>;
  userFlairGrants: Record<string, UserFlairGrant[]>;
  userFlairGrantLoading: Record<string, boolean>;
  userFlairGrantErrors: Record<string, string | null>;
  userFlairGrantLastLoadedAt: Record<string, number>;
  platformStaff: Record<string, PlatformStaffInfo | null>;
  platformStaffLoading: Record<string, boolean>;
  platformStaffErrors: Record<string, string | null>;
  platformStaffLastLoadedAt: Record<string, number>;
};

export const createInitialProfileState = (): ProfileState => ({
  profiles: {},
  viewerProfiles: {},
  viewerProfileLoading: {},
  viewerProfileErrors: {},
  viewerProfileLastLoadedAt: {},
  profileCards: {},
  profileCardLoading: {},
  profileCardErrors: {},
  profileCardLastLoadedAt: {},
  userFlairGrants: {},
  userFlairGrantLoading: {},
  userFlairGrantErrors: {},
  userFlairGrantLastLoadedAt: {},
  platformStaff: {},
  platformStaffLoading: {},
  platformStaffErrors: {},
  platformStaffLastLoadedAt: {},
});

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

/**
 * Four per-user resources share one shape: a value, a loading flag, an error
 * and the time it last loaded. Each maps to its four state keys here so one
 * loader serves all of them alike.
 */
const RESOURCES = {
  viewerProfile: {
    values: "viewerProfiles",
    loading: "viewerProfileLoading",
    errors: "viewerProfileErrors",
    loadedAt: "viewerProfileLastLoadedAt",
  },
  profileCard: {
    values: "profileCards",
    loading: "profileCardLoading",
    errors: "profileCardErrors",
    loadedAt: "profileCardLastLoadedAt",
  },
  userFlairs: {
    values: "userFlairGrants",
    loading: "userFlairGrantLoading",
    errors: "userFlairGrantErrors",
    loadedAt: "userFlairGrantLastLoadedAt",
  },
  platformStaff: {
    values: "platformStaff",
    loading: "platformStaffLoading",
    errors: "platformStaffErrors",
    loadedAt: "platformStaffLastLoadedAt",
  },
} as const satisfies Record<
  string,
  Record<"values" | "loading" | "errors" | "loadedAt", keyof ProfileState>
>;

type Resource = keyof typeof RESOURCES;

const DEFAULT_FRESHNESS_MS = 60_000;

/**
 * Who people are: live identities for rendering, the viewer's own profile,
 * profile cards, flair grants and platform-staff info — each loaded per user,
 * deduped, and tracked with loading and error state.
 */
export class ProfileNexus {
  private readonly gate = createLoadGate();

  constructor(
    protected readonly port: StatePort<ProfileState>,
    private readonly controlPlane: ControlPlaneBackend,
  ) {}

  // ─── live identities (realtime + priming) ──────────────────────────────────

  getProfile(userId: string): LiveProfileIdentity | undefined {
    return this.port.get().profiles[userId];
  }

  upsertProfile(profile: LiveProfileIdentity): void {
    this.port.set({
      profiles: { ...this.port.get().profiles, [profile.userId]: profile },
    });
  }

  upsertProfiles(profiles: LiveProfileIdentity[]): void {
    if (profiles.length === 0) return;
    const next = { ...this.port.get().profiles };
    for (const profile of profiles) next[profile.userId] = profile;
    this.port.set({ profiles: next });
  }

  removeProfile(userId: string): void {
    const profiles = this.port.get().profiles;
    if (!profiles[userId]) return;
    const { [userId]: _removed, ...rest } = profiles;
    this.port.set({ profiles: rest });
  }

  // ─── viewer profile ────────────────────────────────────────────────────────

  getViewerProfile(userId: string): UserProfileInfo | null | undefined {
    return this.port.get().viewerProfiles[userId];
  }

  getViewerProfileError(userId: string): string | null {
    return this.port.get().viewerProfileErrors[userId] ?? null;
  }

  async loadViewerProfile(userId: string): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    return this.load(
      "viewerProfile",
      userId,
      () => this.controlPlane.fetchUserProfile(userId),
      "Failed to load profile.",
      (profile) => this.storeViewerProfile(userId, profile),
    );
  }

  async ensureViewerProfile(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserProfileInfo | null> {
    if (!userId.trim()) return null;
    return this.ensure("viewerProfile", userId, options, null, () =>
      this.loadViewerProfile(userId),
    );
  }

  async updateViewerProfile(
    input: ViewerProfileUpdateInput,
  ): Promise<UserProfileInfo> {
    const result = await this.controlPlane.updateUserProfile(input);
    this.storeViewerProfile(input.userId, result);
    return result;
  }

  // ─── profile cards ─────────────────────────────────────────────────────────

  getProfileCard(userId: string): UserProfileCard | null | undefined {
    return this.port.get().profileCards[userId];
  }

  getProfileCardError(userId: string): string | null {
    return this.port.get().profileCardErrors[userId] ?? null;
  }

  async loadProfileCard(userId: string): Promise<UserProfileCard | null> {
    if (!userId.trim()) return null;
    return this.load(
      "profileCard",
      userId,
      () => this.controlPlane.fetchProfileCard(userId),
      "Failed to load profile card.",
      (card) => this.storeProfileCard(userId, card),
    );
  }

  // ─── flair ─────────────────────────────────────────────────────────────────

  getUserFlairGrants(userId: string): UserFlairGrant[] {
    return this.port.get().userFlairGrants[userId] ?? [];
  }

  getUserFlairGrantError(userId: string): string | null {
    return this.port.get().userFlairGrantErrors[userId] ?? null;
  }

  async loadMyUserFlairs(userId: string): Promise<UserFlairGrant[]> {
    if (!userId.trim()) return [];
    return this.load(
      "userFlairs",
      userId,
      () => this.controlPlane.listMyUserFlairs(),
      "Failed to load flair.",
      (grants) => this.storeValue("userFlairs", userId, grants),
    );
  }

  async ensureMyUserFlairs(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserFlairGrant[]> {
    if (!userId.trim()) return [];
    return this.ensure("userFlairs", userId, options, [], () =>
      this.loadMyUserFlairs(userId),
    );
  }

  /** Switch the viewer's displayed flair, then refresh everything that shows it. */
  async setActiveUserFlair(
    userId: string,
    userFlairId: string | null,
  ): Promise<void> {
    if (!userId.trim()) return;
    await this.controlPlane.setActiveUserFlair(userFlairId);
    await Promise.all([
      this.loadMyUserFlairs(userId),
      this.loadViewerProfile(userId),
      this.loadProfileCard(userId),
    ]);
  }

  // ─── platform staff ────────────────────────────────────────────────────────

  getPlatformStaff(userId: string): PlatformStaffInfo | null | undefined {
    return this.port.get().platformStaff[userId];
  }

  getPlatformStaffError(userId: string): string | null {
    return this.port.get().platformStaffErrors[userId] ?? null;
  }

  async loadPlatformStaff(userId: string): Promise<PlatformStaffInfo | null> {
    if (!userId.trim()) return null;
    return this.load(
      "platformStaff",
      userId,
      () => this.controlPlane.fetchPlatformStaff(userId),
      "Failed to load platform staff info.",
      (staff) => this.storeValue("platformStaff", userId, staff),
    );
  }

  async ensurePlatformStaff(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<PlatformStaffInfo | null> {
    if (!userId.trim()) return null;
    return this.ensure("platformStaff", userId, options, null, () =>
      this.loadPlatformStaff(userId),
    );
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  clear(): void {
    this.gate.clear();
    this.port.set(createInitialProfileState());
  }

  // ─── the one per-user loader ───────────────────────────────────────────────

  /** Load a per-user resource once at a time, tracking its loading flag and error. */
  private load<V>(
    resource: Resource,
    userId: string,
    fetch: () => Promise<V>,
    fallbackError: string,
    store: (value: V) => void,
  ): Promise<V> {
    const keys = RESOURCES[resource];
    return this.gate.run(`${resource}:${userId}`, async (stale) => {
      this.patch(keys.loading, userId, true);
      this.patch(keys.errors, userId, null);
      try {
        const value = await fetch();
        if (stale()) return value;
        store(value);
        return value;
      } catch (error) {
        if (stale()) throw error;
        this.patch(keys.errors, userId, messageFromError(error, fallbackError));
        throw error;
      } finally {
        this.patch(keys.loading, userId, false);
      }
    });
  }

  /** The cached value when it loaded recently, otherwise a (deduped) load. */
  private ensure<V>(
    resource: Resource,
    userId: string,
    options: { freshnessMs?: number } | undefined,
    empty: V,
    load: () => Promise<V>,
  ): Promise<V> {
    if (this.gate.isRunning(`${resource}:${userId}`)) return load();
    const keys = RESOURCES[resource];
    const state = this.port.get();
    const values = state[keys.values] as Record<string, V>;
    const loadedAt = state[keys.loadedAt] as Record<string, number>;
    if (
      Object.prototype.hasOwnProperty.call(values, userId) &&
      isFresh(
        loadedAt[userId] ?? 0,
        options?.freshnessMs ?? DEFAULT_FRESHNESS_MS,
      )
    ) {
      return Promise.resolve(values[userId] ?? empty);
    }
    return load();
  }

  private storeValue<V>(resource: Resource, userId: string, value: V): void {
    const keys = RESOURCES[resource];
    this.patch(keys.values, userId, value);
    this.patch(keys.loadedAt, userId, Date.now());
  }

  /** The viewer's profile also yields their live identity and their own profile card. */
  private storeViewerProfile(
    userId: string,
    profile: UserProfileInfo | null,
  ): void {
    this.storeValue("viewerProfile", userId, profile);
    if (!profile) return;
    this.storeProfileCard(userId, {
      userId,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      profileVisibility: profile.profileVisibility,
      canViewDetails: true,
      details: { bio: profile.profileBio, activeFlair: profile.activeFlair },
    });
  }

  /** A profile card also yields that user's live identity. */
  private storeProfileCard(userId: string, card: UserProfileCard | null): void {
    this.storeValue("profileCard", userId, card);
    if (!card) return;
    this.upsertProfile({
      userId,
      username: card.username,
      avatarUrl: card.avatarUrl,
      updatedAt: new Date().toISOString(),
    });
  }

  private patch(key: keyof ProfileState, userId: string, value: unknown): void {
    const current = this.port.get()[key] as Record<string, unknown>;
    // A computed key widens to an index signature; the cast restores it.
    this.port.set({
      [key]: { ...current, [userId]: value },
    } as Partial<ProfileState>);
  }
}
