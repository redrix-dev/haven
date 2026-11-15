/**
 * People: profiles, the caller's own settings and terms, flair, feature
 * flags, onboarding, and deleting the account.
 * DATABASE.md: "People", "Operations".
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { maybeRow, rows, rpc, rpcRows, type RpcArgs } from "./client";
import type {
  FeatureFlag,
  HeldFlair,
  MyProfile,
  OnboardingCampaign,
  OnboardingOutcome,
  ProfileCardRecord,
  ProfileRecord,
  TermsAcceptance,
  TermsVersion,
  UserSettings,
} from "./records";

export type ProfileChanges = {
  username?: string;
  /** An empty string clears the bio; leaving it out keeps it. */
  bio?: string;
};

/**
 * Each setting left out is kept. The privacy rules (`details_visible_to`,
 * `dms_from`, `friend_requests_from`) are settings like the theme.
 */
export type SettingsChanges = Partial<
  Omit<UserSettings, "user_id" | "updated_at">
>;

/**
 * The argument each setting goes in as. A new column of user_settings does
 * not compile until it is named here, so it cannot be left unsaveable.
 */
const settingArgs = {
  theme: "p_theme",
  details_visible_to: "p_details_visible_to",
  dms_from: "p_dms_from",
  friend_requests_from: "p_friend_requests_from",
} as const satisfies Record<
  keyof SettingsChanges,
  keyof RpcArgs<"update_my_settings">
>;

/**
 * Everything about the person's own account, read at once. A new part of the
 * account is one more field here and one more read in `loadMyAccount`; the
 * database sends `account.changed` when any part changes.
 */
export type MyAccount = {
  /** Null only for an account the database no longer has. */
  settings: UserSettings | null;
  profile: MyProfile | null;
  /** Every version, newest first. */
  terms_versions: TermsVersion[];
  terms_accepted: TermsAcceptance[];
  /** Including ones that have expired or been retired. */
  flairs: HeldFlair[];
  feature_flags: FeatureFlag[];
  /** The introductions offered to this person on this build, in order. */
  onboarding: OnboardingCampaign[];
};

/** Where the app is running, for deciding which onboarding to offer. */
export type OnboardingContext = {
  platform: string;
  distribution?: string | null;
  app_version?: string | null;
};

export function createPeopleBackend(client: HavenSupabaseClient) {
  const people = {
    /** People by id, in no particular order. Unknown ids are left out. */
    async getProfiles(userIds: string[]): Promise<ProfileRecord[]> {
      if (userIds.length === 0) return [];
      return rpcRows<ProfileRecord>(client, "get_profiles", {
        p_user_ids: userIds,
      });
    },

    async getProfileCard(userId: string): Promise<ProfileCardRecord> {
      return (await rpc(client, "get_profile_card", {
        p_user_id: userId,
      })) as ProfileCardRecord;
    },

    /** Exact name, any case. Null when nobody has it or they blocked you. */
    async findUser(username: string): Promise<ProfileRecord | null> {
      const [found] = await rpcRows<ProfileRecord>(client, "find_user", {
        p_username: username,
      });
      return found ?? null;
    },

    /** Whether a name is in use, in any case. Works signed out, for sign-up. */
    async usernameTaken(username: string): Promise<boolean> {
      return (await rpc(client, "username_taken", {
        p_username: username,
      })) as boolean;
    },

    async updateMyProfile(changes: ProfileChanges): Promise<ProfileRecord> {
      return (await rpc(client, "update_my_profile", {
        p_username: changes.username,
        p_bio: changes.bio,
      })) as ProfileRecord;
    },

    async getMySettings(): Promise<UserSettings | null> {
      return maybeRow(
        await client.from("user_settings").select("*").maybeSingle(),
      );
    },

    async updateMySettings(changes: SettingsChanges): Promise<UserSettings> {
      const args: RpcArgs<"update_my_settings"> = {};
      for (const [setting, value] of Object.entries(changes)) {
        args[settingArgs[setting as keyof SettingsChanges]] = value as never;
      }
      return (await rpc(client, "update_my_settings", args)) as UserSettings;
    },

    /** Null without a session. */
    async getMyProfile(): Promise<MyProfile | null> {
      const [profile] = await rpcRows<MyProfile>(client, "get_my_profile", {});
      return profile ?? null;
    },

    async loadMyAccount(context: OnboardingContext): Promise<MyAccount> {
      const [
        settings,
        profile,
        terms_versions,
        terms_accepted,
        flairs,
        feature_flags,
        onboarding,
      ] = await Promise.all([
        people.getMySettings(),
        people.getMyProfile(),
        people.listTermsVersions(),
        people.listMyTermsAcceptances(),
        people.listMyFlairs(),
        people.getMyFeatureFlags(),
        people.listMyOnboarding(context),
      ]);
      return {
        settings,
        profile,
        terms_versions,
        terms_accepted,
        flairs,
        feature_flags,
        onboarding,
      };
    },

    /** Every version of the terms, newest first. */
    async listTermsVersions(): Promise<TermsVersion[]> {
      return rows(
        await client
          .from("terms_versions")
          .select("*")
          .order("published_at", { ascending: false }),
      );
    },

    async listMyTermsAcceptances(): Promise<TermsAcceptance[]> {
      return rows(await client.from("terms_acceptances").select("*"));
    },

    async acceptTerms(version: string): Promise<void> {
      await rpc(client, "accept_terms", { p_version: version });
    },

    /** The flairs the caller holds, each with what it looks like. */
    async listMyFlairs(): Promise<HeldFlair[]> {
      const held = rows(await client.from("user_flairs").select("*"));
      if (held.length === 0) return [];
      const flairs = rows(
        await client
          .from("flairs")
          .select("*")
          .in(
            "id",
            held.map((row) => row.flair_id),
          ),
      );
      const byId = new Map(flairs.map((flair) => [flair.id, flair]));
      return held.flatMap((row) => {
        const flair = byId.get(row.flair_id);
        return flair ? [{ ...row, flair }] : [];
      });
    },

    /** Null takes the flair off. */
    async setActiveFlair(flairId: string | null): Promise<void> {
      await rpc(client, "set_active_flair", { p_flair_id: flairId });
    },

    async getMyFeatureFlags(): Promise<FeatureFlag[]> {
      return rpcRows<FeatureFlag>(client, "get_my_feature_flags", {});
    },

    async listMyOnboarding(
      context: OnboardingContext,
    ): Promise<OnboardingCampaign[]> {
      return rpcRows<OnboardingCampaign>(client, "list_my_onboarding", {
        p_platform: context.platform,
        p_distribution: context.distribution,
        p_app_version: context.app_version,
      });
    },

    async answerOnboarding(
      campaignKey: string,
      outcome: OnboardingOutcome,
      context: OnboardingContext,
    ): Promise<void> {
      await rpc(client, "answer_onboarding", {
        p_campaign_key: campaignKey,
        p_outcome: outcome,
        p_platform: context.platform,
        p_distribution: context.distribution,
        p_app_version: context.app_version,
      });
    },

    /**
     * Deletes the account: messages and files everywhere, the login, and
     * leaves a blank profile. Refused (`owns_communities`) while the caller
     * owns a community with other members in it.
     */
    async deleteMyAccount(): Promise<void> {
      await rpc(client, "delete_my_account", {});
    },
  };
  return people;
}

export type PeopleBackend = ReturnType<typeof createPeopleBackend>;
