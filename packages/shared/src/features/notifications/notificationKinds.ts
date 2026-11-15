import type { NotificationKind } from "@shared/lib/backend/records";

/**
 * The kinds of notification a person may turn off, with how settings name
 * them, both platforms. The others (reports, decisions about them, notices
 * from Haven) always arrive: the database refuses to turn them off
 * (`kind_not_optional`).
 */
export type OptionalNotificationKind = Extract<
  NotificationKind,
  | "friend_request"
  | "friend_accepted"
  | "friend_link"
  | "direct_message"
  | "mention"
>;

export const OPTIONAL_NOTIFICATION_KINDS: Record<
  OptionalNotificationKind,
  { label: string; description: string }
> = {
  direct_message: {
    label: "Direct messages",
    description: "Messages sent privately to you.",
  },
  mention: {
    label: "Mentions",
    description: "Messages that mention you.",
  },
  friend_request: {
    label: "Friend requests",
    description: "Someone asks to be your friend.",
  },
  friend_accepted: {
    label: "Accepted requests",
    description: "Someone accepted your request or your friend link.",
  },
  friend_link: {
    label: "Friend links",
    description: "Someone declined your link, or it ran out.",
  },
};
