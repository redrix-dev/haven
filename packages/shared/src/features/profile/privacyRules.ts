import type { Audience, UserSettings } from "@shared/lib/backend/records";

/**
 * The three privacy rules and how settings word them, both platforms. Each
 * is an audience (`nobody | friends | community | everyone`, each step
 * including the one before); a block beats every rule. The database applies
 * them; these are only the words. DATABASE.md, "Who may reach whom".
 */
export type PrivacyRule = keyof Pick<
  UserSettings,
  "details_visible_to" | "dms_from" | "friend_requests_from"
>;

export const AUDIENCE_LABELS: Record<Audience, string> = {
  nobody: "Nobody",
  friends: "Friends",
  community: "Friends and people in my communities",
  everyone: "Everyone",
};

export const PRIVACY_RULES: Record<
  PrivacyRule,
  { label: string; description: string; audiences: readonly Audience[] }
> = {
  details_visible_to: {
    label: "Who sees my profile details",
    description:
      "Your bio and flair. Everyone always sees your username and picture.",
    audiences: ["nobody", "friends", "community", "everyone"],
  },
  dms_from: {
    label: "Who can start a conversation with me",
    description:
      "A conversation you already have stays open while either of your rules lets the other in.",
    audiences: ["nobody", "friends", "community", "everyone"],
  },
  friend_requests_from: {
    label: "Who can send me friend requests",
    description:
      "Friend links you hand out work whatever this says: whoever opens one still has to accept it.",
    // Friends cannot ask to be friends: the database refuses `friends` here.
    audiences: ["nobody", "community", "everyone"],
  },
};

export const PRIVACY_RULE_ORDER: readonly PrivacyRule[] = [
  "details_visible_to",
  "dms_from",
  "friend_requests_from",
];
