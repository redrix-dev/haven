import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { listUserCommunitiesWithClient } from "@shared/lib/listUserCommunitiesWithClient";
import type { Database } from "@shared/types/database";
import { getTheme } from "@shared/themes/registry";
import type { ControlPlaneBackend } from "./controlPlaneBackend.interface";
import type {
  BanEligibleServer,
  FeatureFlagsSnapshot,
  LiveProfileIdentity,
  OnboardingCampaign,
  OnboardingCompletionResult,
  OnboardingDistributionScope,
  OnboardingPlatformScope,
  ProfileVisibility,
  RedeemedInvite,
  ServerInvite,
  ServerSummary,
  UserFlairBadge,
  UserFlairGrant,
  UserProfileCard,
} from "./types";

export type {
  ControlPlaneBackend,
  PlatformStaffInfo,
  UserProfileInfo,
} from "./controlPlaneBackend.interface";

type PrivateUserChannelEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const parsePrivateUserBroadcastEvent = (
  raw: unknown,
): PrivateUserChannelEvent => {
  const envelope =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const type = typeof envelope.event === "string" ? envelope.event : "";
  const inner = envelope.payload;
  const recordPayload =
    inner != null && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};

  return { type, payload: recordPayload };
};

const PROFILE_AVATAR_BUCKET = "profile-avatars";
const PROFILE_AVATAR_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
const PROFILE_AVATAR_PUBLIC_PATH_SEGMENT = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;

const getProfileAvatarObjectPathFromUrl = (
  avatarUrl: string,
): string | null => {
  try {
    const parsed = new URL(avatarUrl);
    const bucketPathStart = parsed.pathname.indexOf(
      PROFILE_AVATAR_PUBLIC_PATH_SEGMENT,
    );
    if (bucketPathStart === -1) return null;
    const objectPath = decodeURIComponent(
      parsed.pathname.slice(
        bucketPathStart + PROFILE_AVATAR_PUBLIC_PATH_SEGMENT.length,
      ),
    ).trim();
    return objectPath.length > 0 ? objectPath : null;
  } catch {
    return null;
  }
};

type InviteRecord = Pick<
  Database["public"]["Tables"]["invites"]["Row"],
  "id" | "code" | "current_uses" | "max_uses" | "expires_at" | "is_active"
>;

type FeatureFlagRow = {
  flag_key: string;
  enabled: boolean;
};

type OnboardingCampaignRow = {
  campaign_key: string;
  feature_flag_key: string;
  title: string;
  description: string | null;
  required: boolean;
  target_community_id: string | null;
  target_flair_key: string | null;
  platform_scope: string;
  distribution_scope: string;
  sort_order: number;
};

type OnboardingCompletionRow = {
  campaign_key: string;
  status: string;
  community_id: string | null;
  community_name: string | null;
  joined: boolean | null;
};

type ProfileIdentityRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  updated_at: string;
};

type ProfileCardRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  profile_visibility: string | null;
  can_view_details: boolean | null;
  profile_bio: string | null;
  active_flair_user_flair_id: string | null;
  active_flair_id: string | null;
  active_flair_key: string | null;
  active_flair_label: string | null;
  active_flair_description: string | null;
  active_flair_color_token: string | null;
  active_flair_background_token: string | null;
  active_flair_icon_key: string | null;
};

type UserFlairGrantRow = {
  user_flair_id: string;
  flair_id: string;
  flair_key: string;
  label: string;
  description: string | null;
  color_token: string;
  background_token: string;
  icon_key: string | null;
  scope: string;
  community_id: string | null;
  grant_source: string;
  source_community_id: string | null;
  granted_at: string;
  expires_at: string | null;
  is_available: boolean | null;
  is_selected: boolean | null;
};

const PROFILE_VISIBILITIES: readonly ProfileVisibility[] = [
  "public",
  "friends_only",
  "private",
];

const normalizeProfileVisibility = (value: unknown): ProfileVisibility =>
  PROFILE_VISIBILITIES.includes(value as ProfileVisibility)
    ? (value as ProfileVisibility)
    : "private";

const ONBOARDING_PLATFORM_SCOPES: readonly OnboardingPlatformScope[] = [
  "all",
  "ios",
  "android",
];

const ONBOARDING_DISTRIBUTION_SCOPES: readonly OnboardingDistributionScope[] = [
  "all",
  "development",
  "preview",
  "testflight",
  "production",
];

const normalizeOnboardingPlatformScope = (
  value: unknown,
): OnboardingPlatformScope =>
  ONBOARDING_PLATFORM_SCOPES.includes(value as OnboardingPlatformScope)
    ? (value as OnboardingPlatformScope)
    : "all";

const normalizeOnboardingDistributionScope = (
  value: unknown,
): OnboardingDistributionScope =>
  ONBOARDING_DISTRIBUTION_SCOPES.includes(value as OnboardingDistributionScope)
    ? (value as OnboardingDistributionScope)
    : "all";

const mapOnboardingCampaign = (
  row: OnboardingCampaignRow,
): OnboardingCampaign => ({
  key: row.campaign_key,
  featureFlagKey: row.feature_flag_key,
  title: row.title,
  description: row.description ?? null,
  required: Boolean(row.required),
  targetCommunityId: row.target_community_id ?? null,
  targetFlairKey: row.target_flair_key ?? null,
  platformScope: normalizeOnboardingPlatformScope(row.platform_scope),
  distributionScope: normalizeOnboardingDistributionScope(
    row.distribution_scope,
  ),
  sortOrder: row.sort_order,
});

const mapOnboardingCompletionResult = (
  row: OnboardingCompletionRow,
): OnboardingCompletionResult => ({
  campaignKey: row.campaign_key,
  status: row.status === "skipped" ? "skipped" : "completed",
  communityId: row.community_id ?? null,
  communityName: row.community_name ?? null,
  joined: Boolean(row.joined),
});

export const mapLiveProfileIdentity = (
  row: ProfileIdentityRow,
): LiveProfileIdentity => ({
  userId: row.user_id,
  username: row.username,
  avatarUrl: row.avatar_url ?? null,
  updatedAt: row.updated_at,
});

const mapUserFlairBadgeFromProfileCard = (
  row: ProfileCardRow,
): UserFlairBadge | null => {
  if (
    !row.active_flair_user_flair_id ||
    !row.active_flair_id ||
    !row.active_flair_key ||
    !row.active_flair_label ||
    !row.active_flair_color_token ||
    !row.active_flair_background_token
  ) {
    return null;
  }

  return {
    userFlairId: row.active_flair_user_flair_id,
    flairId: row.active_flair_id,
    key: row.active_flair_key,
    label: row.active_flair_label,
    description: row.active_flair_description ?? null,
    colorToken: row.active_flair_color_token,
    backgroundToken: row.active_flair_background_token,
    iconKey: row.active_flair_icon_key ?? null,
  };
};

const mapUserFlairGrant = (row: UserFlairGrantRow): UserFlairGrant => ({
  userFlairId: row.user_flair_id,
  flairId: row.flair_id,
  key: row.flair_key,
  label: row.label,
  description: row.description ?? null,
  colorToken: row.color_token,
  backgroundToken: row.background_token,
  iconKey: row.icon_key ?? null,
  scope: row.scope === "community" ? "community" : "platform",
  communityId: row.community_id ?? null,
  grantSource: row.grant_source,
  sourceCommunityId: row.source_community_id ?? null,
  grantedAt: row.granted_at,
  expiresAt: row.expires_at ?? null,
  isAvailable: Boolean(row.is_available),
  isSelected: Boolean(row.is_selected),
});

const mapUserProfileCard = (row: ProfileCardRow): UserProfileCard => {
  const canViewDetails = Boolean(row.can_view_details);
  const activeFlair = canViewDetails
    ? mapUserFlairBadgeFromProfileCard(row)
    : null;
  return {
    userId: row.user_id,
    username: row.username,
    avatarUrl: row.avatar_url ?? null,
    profileVisibility: normalizeProfileVisibility(row.profile_visibility),
    canViewDetails,
    details: canViewDetails
      ? { bio: row.profile_bio ?? null, activeFlair }
      : null,
  };
};

const mapInvite = (invite: InviteRecord): ServerInvite => ({
  id: invite.id,
  code: invite.code,
  currentUses: invite.current_uses,
  maxUses: invite.max_uses,
  expiresAt: invite.expires_at,
  isActive: invite.is_active,
});

export function createControlPlaneBackend(
  client: HavenSupabaseClient,
): ControlPlaneBackend {
  const requireAuthenticatedUserId = async (): Promise<string> => {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error) throw error;
    if (!user?.id) {
      throw new Error("Not authenticated.");
    }

    return user.id;
  };

  const backend: ControlPlaneBackend = {
    async fetchUserProfile(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("username, avatar_url, theme, profile_visibility, profile_bio")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      const profileCard = await backend.fetchProfileCard(userId);
      return {
        username: data.username,
        avatarUrl: data.avatar_url,
        theme: getTheme(data.theme ?? "default").id,
        profileVisibility: normalizeProfileVisibility(data.profile_visibility),
        profileBio: data.profile_bio ?? null,
        activeFlair: profileCard?.details?.activeFlair ?? null,
      };
    },

    async fetchProfileCard(userId) {
      const { data, error } = await client.rpc(
        "get_profile_card" as never,
        {
          p_user_id: userId,
        } as never,
      );

      if (error) throw error;

      const row = Array.isArray(data)
        ? ((data[0] ?? null) as ProfileCardRow | null)
        : ((data ?? null) as ProfileCardRow | null);

      return row ? mapUserProfileCard(row) : null;
    },

    async fetchPlatformStaff(userId) {
      const { data, error } = await client
        .from("platform_staff")
        .select("is_active, display_prefix")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        isActive: Boolean(data.is_active),
        displayPrefix: data.display_prefix ?? null,
      };
    },

    async listMyUserFlairs() {
      const { data, error } = await client.rpc("list_my_user_flairs" as never);
      if (error) throw error;
      return ((data ?? []) as UserFlairGrantRow[]).map(mapUserFlairGrant);
    },

    async setActiveUserFlair(userFlairId) {
      const { error } = await client.rpc(
        "set_active_user_flair" as never,
        {
          p_user_flair_id: userFlairId,
        } as never,
      );
      if (error) throw error;
    },

    async listMyFeatureFlags() {
      const { data, error } = await client.rpc(
        "list_my_feature_flags" as never,
      );
      if (error) throw error;

      const snapshot: FeatureFlagsSnapshot = {};
      for (const row of (data ?? []) as FeatureFlagRow[]) {
        if (!row?.flag_key) continue;
        snapshot[row.flag_key] = Boolean(row.enabled);
      }
      return snapshot;
    },

    async listMyOnboardingCampaigns(context) {
      const { data, error } = await client.rpc(
        "list_my_onboarding_campaigns" as never,
        {
          p_platform: context.platform,
          p_distribution: context.distribution,
          p_app_version: context.appVersion,
        } as never,
      );
      if (error) throw error;

      return ((data ?? []) as OnboardingCampaignRow[]).map(
        mapOnboardingCampaign,
      );
    },

    async completeOnboardingCampaign(campaignKey, context) {
      const { data, error } = await client.rpc(
        "complete_onboarding_campaign" as never,
        {
          p_campaign_key: campaignKey,
          p_platform: context.platform,
          p_distribution: context.distribution,
          p_app_version: context.appVersion,
        } as never,
      );
      if (error) throw error;

      const row = Array.isArray(data)
        ? ((data[0] ?? null) as OnboardingCompletionRow | null)
        : ((data ?? null) as OnboardingCompletionRow | null);

      if (!row?.campaign_key) {
        throw new Error("Onboarding completion returned no campaign.");
      }

      return mapOnboardingCompletionResult(row);
    },

    async uploadAvatar(file, options) {
      const byteLength =
        file instanceof ArrayBuffer ? file.byteLength : file.size;
      if (byteLength > PROFILE_AVATAR_FILE_SIZE_LIMIT) {
        throw new Error("Avatar images must be 5MB or smaller.");
      }

      const contentType =
        options?.contentType ??
        (file instanceof Blob ? file.type || "image/webp" : "image/jpeg");

      const userId = await requireAuthenticatedUserId();
      const objectPath = `${userId}/${Date.now()}.webp`;
      const { error: uploadError } = await client.storage
        .from(PROFILE_AVATAR_BUCKET)
        .upload(objectPath, file, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = client.storage
        .from(PROFILE_AVATAR_BUCKET)
        .getPublicUrl(objectPath);
      if (!data.publicUrl) {
        throw new Error("Failed to resolve avatar URL.");
      }

      return data.publicUrl;
    },

    async deleteAvatar(avatarUrl) {
      const objectPath = getProfileAvatarObjectPathFromUrl(avatarUrl);
      if (!objectPath) return;

      try {
        await client.storage.from(PROFILE_AVATAR_BUCKET).remove([objectPath]);
      } catch {
        // Intentionally ignore avatar cleanup failures during profile updates.
      }
    },

    async updateUserProfile({
      userId,
      username,
      avatarUrl,
      avatarFile = null,
      avatarContentType,
      theme,
      profileVisibility,
      profileBio,
    }) {
      const { data: existingProfile, error: existingProfileError } =
        await client
          .from("profiles")
          .select("avatar_url, theme, profile_visibility, profile_bio")
          .eq("id", userId)
          .maybeSingle();

      if (existingProfileError) throw existingProfileError;

      const priorThemeId = getTheme(existingProfile?.theme ?? "default").id;
      const priorProfileVisibility = normalizeProfileVisibility(
        existingProfile?.profile_visibility,
      );
      const priorProfileBio = existingProfile?.profile_bio ?? null;

      const existingAvatarUrl = existingProfile?.avatar_url ?? null;
      let nextAvatarUrl = avatarUrl;

      if (avatarFile) {
        if (existingAvatarUrl) {
          await backend.deleteAvatar(existingAvatarUrl);
        }
        const uploadOpts =
          avatarFile instanceof ArrayBuffer
            ? { contentType: avatarContentType ?? "image/jpeg" }
            : undefined;
        nextAvatarUrl = await backend.uploadAvatar(avatarFile, uploadOpts);
      } else if (avatarUrl === null && existingAvatarUrl) {
        await backend.deleteAvatar(existingAvatarUrl);
      }

      const updatePayload: {
        username: string;
        avatar_url: string | null;
        theme?: string;
        profile_visibility?: ProfileVisibility;
        profile_bio?: string | null;
      } = {
        username,
        avatar_url: nextAvatarUrl,
      };
      if (theme !== undefined) {
        updatePayload.theme = getTheme(theme).id;
      }
      if (profileVisibility !== undefined) {
        updatePayload.profile_visibility =
          normalizeProfileVisibility(profileVisibility);
      }
      if (profileBio !== undefined) {
        updatePayload.profile_bio = profileBio;
      }

      const { error } = await client
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (error) throw error;

      const effectiveThemeId =
        theme !== undefined ? getTheme(theme).id : priorThemeId;
      const effectiveProfileVisibility =
        profileVisibility !== undefined
          ? normalizeProfileVisibility(profileVisibility)
          : priorProfileVisibility;
      const effectiveProfileBio =
        profileBio !== undefined ? profileBio : priorProfileBio;

      return {
        username,
        avatarUrl: nextAvatarUrl,
        theme: effectiveThemeId,
        profileVisibility: effectiveProfileVisibility,
        profileBio: effectiveProfileBio,
        activeFlair:
          (await backend.fetchProfileCard(userId))?.details?.activeFlair ??
          null,
      };
    },

    async listUserCommunities(userId) {
      return listUserCommunitiesWithClient(client, userId);
    },

    async renameCommunity({ communityId, name }) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new Error("Server name is required.");
      }

      const { error } = await client
        .from("communities")
        .update({ name: normalizedName })
        .eq("id", communityId);
      if (error) throw error;
    },

    async deleteCommunity(communityId) {
      const { error } = await client
        .from("communities")
        .delete()
        .eq("id", communityId);
      if (error) throw error;
    },

    async leaveCommunity(communityId) {
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error("Not authenticated.");

      const { data: membership, error: membershipError } = await client
        .from("community_members")
        .select("is_owner")
        .eq("community_id", communityId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) throw new Error("You are not a member of this server.");
      if (membership.is_owner) {
        throw new Error(
          "Owners cannot leave a server. Delete the server instead.",
        );
      }

      const { error } = await client
        .from("community_members")
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", user.id);
      if (error) throw error;
    },

    subscribeToPrivateUserChannel(userId, onEvent) {
      const channelName = `private_user:${userId}`;
      let cancelled = false;
      let channel: ReturnType<typeof client.channel> | null = null;

      const {
        data: { subscription: authSubscription },
      } = client.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return;
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION"
        ) {
          await client.realtime.setAuth(session?.access_token ?? "");
        }
      });

      void (async () => {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (cancelled) return;

        await client.realtime.setAuth(session?.access_token ?? "");
        if (cancelled) return;

        channel = client.channel(channelName, {
          config: { private: true },
        });

        channel
          .on("broadcast", { event: "*" }, (payload: unknown) => {
            const parsed = parsePrivateUserBroadcastEvent(payload);
            if (!parsed.type) {
              console.warn(
                "[private_user_channel] broadcast missing event name",
                payload,
              );
              return;
            }
            onEvent(parsed);
          })
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn(
                `${channelName} did not reach SUBSCRIBED (status: ${status})`,
              );
            }
          });
      })();

      return () => {
        cancelled = true;
        authSubscription.unsubscribe();
        if (channel) void client.removeChannel(channel);
      };
    },

    async createCommunity(name) {
      const { data, error } = await client.rpc("create_community", {
        p_name: name,
        // Supabase generated RPC types use `undefined` for optional args.
        p_description: undefined,
      });

      if (error) throw error;
      if (!data?.id) {
        throw new Error("Failed to create community.");
      }

      return { id: data.id };
    },

    async createCommunityInvite({ communityId, maxUses, expiresInHours }) {
      const { data, error } = await client.rpc("create_community_invite", {
        p_community_id: communityId,
        p_max_uses: maxUses ?? undefined,
        p_expires_in_hours: expiresInHours ?? undefined,
      });

      if (error) throw error;
      if (!data) throw new Error("Failed to create invite.");
      return mapInvite(data);
    },

    async redeemCommunityInvite(code) {
      const { data, error } = await client.rpc("redeem_community_invite", {
        p_code: code,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;

      if (!row?.community_id) {
        throw new Error("Invite redemption returned no community.");
      }

      return {
        communityId: row.community_id,
        communityName: row.community_name,
        joined: row.joined,
      };
    },

    async listBanEligibleServersForUser(targetUserId) {
      if (!targetUserId) return [];
      const { data, error } = await client.rpc(
        "list_bannable_shared_communities",
        {
          p_target_user_id: targetUserId,
        },
      );
      if (error) throw error;
      return (data ?? []).map((row) => ({
        communityId: row.community_id,
        communityName: row.community_name,
      }));
    },

    async listActiveCommunityInvites(communityId) {
      const { data, error } = await client
        .from("invites")
        .select("id, code, current_uses, max_uses, expires_at, is_active")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map(mapInvite);
    },

    async revokeCommunityInvite(communityId, inviteId) {
      const { error } = await client
        .from("invites")
        .update({ is_active: false })
        .eq("community_id", communityId)
        .eq("id", inviteId);

      if (error) throw error;
    },
  };

  return backend;
}
