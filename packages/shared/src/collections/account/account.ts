/**
 * Account: the person's own account. Their settings, what only they see of
 * their profile, the terms they accepted, their flairs, their feature flags,
 * and the introductions offered to them. DATABASE.md: "People",
 * "Operations".
 *
 * All of it loads at once (`loadMyAccount`), and loads again whenever the
 * database says `account.changed`: from this device, another one, or
 * something that happened to them (a flair a community gave, a flag turned).
 * So no part is patched by hand except settings, whose new row comes back
 * in the answer. A new part of the account is a field of `MyAccount`, which
 * this collection holds as it is.
 *
 * Everyone's view of the person (name, picture) is in `profiles`.
 */

import type {
  MyAccount,
  OnboardingContext,
  PeopleBackend,
  ProfileChanges,
  SettingsChanges,
} from "@shared/lib/backend/people";
import type {
  OnboardingCampaign,
  OnboardingOutcome,
  ProfileRecord,
  UserSettings,
} from "@shared/lib/backend/records";
import type { DeviceCopy } from "../kit/deviceCopies";
import { Requests, type RequestMap } from "../kit/requests";
import type { StatePort } from "../kit/statePort";

export type AccountState = MyAccount & { requests: RequestMap };

/** Before the first load. Each part is empty, not missing. */
export const createAccountState = (): AccountState => ({
  settings: null,
  profile: null,
  terms_versions: [],
  terms_accepted: [],
  flairs: [],
  feature_flags: [],
  onboarding: [],
  requests: {},
});

type SavedAccount = { settings: UserSettings | null };

/** Settings only, so the first screen is in the person's theme. */
export const accountCopy: DeviceCopy<AccountState, SavedAccount> = {
  name: "account",
  version: 1,
  pick: (state) => ({ settings: state.settings }),
  restore: (saved) => ({ settings: saved.settings }),
};

export type AccountBackendPart = Pick<
  PeopleBackend,
  | "loadMyAccount"
  | "updateMySettings"
  | "updateMyProfile"
  | "acceptTerms"
  | "setActiveFlair"
  | "answerOnboarding"
  | "deleteMyAccount"
>;

export class Account {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<AccountState>,
    private readonly backend: AccountBackendPart,
    /** Where the app runs, which decides the introductions offered. */
    private readonly context: OnboardingContext,
  ) {
    this.requests = new Requests("account", port);
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /**
   * The whole account, replacing what is held. The answer to signing in,
   * reconnecting and `account.changed`, so it never joins a load that
   * started before the change.
   */
  load(): Promise<void> {
    return this.requests.refresh("account", async (stale) => {
      const mine = await this.backend.loadMyAccount(this.context);
      if (stale()) return;
      this.port.set(mine);
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  async updateSettings(changes: SettingsChanges): Promise<void> {
    const settings = await this.backend.updateMySettings(changes);
    this.port.set({ settings });
  }

  /**
   * Returns everyone's view of the person after the change, for `profiles`
   * to hold. What only they see is loaded here again.
   */
  async updateProfile(changes: ProfileChanges): Promise<ProfileRecord> {
    const profile = await this.backend.updateMyProfile(changes);
    await this.load();
    return profile;
  }

  async acceptTerms(version: string): Promise<void> {
    await this.backend.acceptTerms(version);
    await this.load();
  }

  /** Null takes the flair off. */
  async setActiveFlair(flairId: string | null): Promise<void> {
    await this.backend.setActiveFlair(flairId);
    await this.load();
  }

  /**
   * Returns the introduction answered. Finishing one can join a community,
   * which is for `communities` to load.
   */
  async answerOnboarding(
    campaignKey: string,
    outcome: OnboardingOutcome,
  ): Promise<OnboardingCampaign | null> {
    const campaign =
      this.port.get().onboarding.find((c) => c.key === campaignKey) ?? null;
    await this.backend.answerOnboarding(campaignKey, outcome, this.context);
    await this.load();
    return campaign;
  }

  /** Refused (`owns_communities`) while they own a community with others in it. */
  async deleteAccount(): Promise<void> {
    await this.backend.deleteMyAccount();
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createAccountState());
  }
}
