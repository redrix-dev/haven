import type { HeldFlair } from "@shared/lib/backend/records";
import { answered } from "../kit/requests";
import type { AccountState } from "./account";

/** Whether the account has loaded this session, not just come back from the device. */
export const accountLoaded = (state: AccountState): boolean =>
  answered(state.requests, "account");

/** The newest terms, when the person has not accepted them; else null. */
export function termsToAccept(state: AccountState): string | null {
  const newest = state.terms_versions[0]?.version;
  if (!newest) return null;
  return state.terms_accepted.some((a) => a.version === newest) ? null : newest;
}

/** A flag the database does not know is off. */
export const isFlagOn = (state: AccountState, key: string): boolean =>
  state.feature_flags.some((flag) => flag.key === key && flag.enabled);

const usable = (held: HeldFlair, now: number) =>
  held.flair.retired_at === null &&
  (held.expires_at === null || Date.parse(held.expires_at) > now);

/** The flairs the person can show, by label. */
export const usableFlairs = (
  state: AccountState,
  now = Date.now(),
): HeldFlair[] =>
  state.flairs
    .filter((held) => usable(held, now))
    .sort((a, b) => a.flair.label.localeCompare(b.flair.label));

/** The flair shown on their profile, while it can still be shown. */
export function activeFlair(
  state: AccountState,
  now = Date.now(),
): HeldFlair | null {
  const id = state.profile?.active_flair_id;
  const held = id ? state.flairs.find((h) => h.flair_id === id) : undefined;
  return held && usable(held, now) ? held : null;
}

/** The next introduction to show, in the database's order. */
export const nextOnboarding = (state: AccountState) =>
  state.onboarding[0] ?? null;
