/**
 * The shapes the database hands back, named once.
 *
 * Field names are the database's own (`reply_to_id`, not `replyToId`). Nothing
 * is renamed or re-shaped between Postgres and the screen, so one search finds
 * a field everywhere it is used, and there is no parser to fall out of step.
 *
 * Table rows come straight from the generated types. The record types
 * the database builds by hand (`public.message_record` and friends) are
 * written out here, because the generator marks every field of such a type as
 * "may be null" and types their JSON parts as anything. `RecordsMatchDatabase`
 * at the bottom fails the typecheck if one of them gains or loses a field.
 */

import type {
  CompositeTypes,
  Enums,
  Json,
  Tables,
} from "@shared/types/database";

// ── Words the database uses ─────────────────────────────────────────────────
export type Permission = Enums<"community_permission">;
export type ChannelKind = Enums<"channel_kind">;
export type NotificationKind = Enums<"notification_kind">;
export type NotificationMark = Enums<"notification_mark">;
/** Who a privacy rule lets in: nobody, friends, community, everyone. */
export type Audience = Enums<"audience">;
export type MediaPurpose = Enums<"media_purpose">;
export type ReportSubject = Enums<"report_subject">;
export type ReportStatus = Enums<"report_status">;
export type CaseSource = Enums<"case_source">;
export type CaseStatus = Enums<"case_status">;
export type CaseAction = Enums<"case_action">;
export type VoiceControlAction = Enums<"voice_control_action">;
export type OnboardingOutcome = Enums<"onboarding_outcome">;

// ── Rows read straight from tables ──────────────────────────────────────────
export type UserSettings = Tables<"user_settings">;
export type TermsVersion = Tables<"terms_versions">;
export type TermsAcceptance = Tables<"terms_acceptances">;
export type Flair = Tables<"flairs">;
export type UserFlair = Tables<"user_flairs">;
export type OnboardingCampaign = Tables<"onboarding_campaigns">;

export type FriendRequest = Tables<"friend_requests">;
export type Friendship = Tables<"friendships">;
export type Block = Tables<"blocks">;
export type FriendLink = Tables<"friend_links">;

export type Community = Tables<"communities">;
export type CommunityMember = Tables<"community_members">;
export type Role = Tables<"roles">;
export type RolePermission = Tables<"role_permissions">;
export type MemberRole = Tables<"member_roles">;
export type ChannelCategory = Tables<"channel_categories">;
export type Invite = Tables<"invites">;
export type CommunityBan = Tables<"community_bans">;
export type AuditLogEntry = Tables<"community_audit_log">;

export type Channel = Tables<"channels">;
export type ChannelParticipant = Tables<"channel_participants">;
export type ChannelOverwrite = Tables<"channel_overwrites">;
export type ChannelUserState = Tables<"channel_user_state">;

export type Notification = Tables<"notifications">;
export type NotificationPreference = Tables<"notification_preferences">;
export type PushDevice = Tables<"push_devices">;

export type CommunityReportNote = Tables<"community_report_notes">;
export type PlatformStaff = Tables<"platform_staff">;
export type PlatformCase = Tables<"platform_cases">;
export type PlatformCaseEvent = Tables<"platform_case_events">;
export type PlatformCaseDecision = Tables<"platform_case_decisions">;
export type CaseMedia = Tables<"case_media">;
export type AccountRestriction = Tables<"account_restrictions">;

// ── Records the database builds ─────────────────────────────────────────────

/** A person, as everyone sees them. `username` is null once the account is deleted. */
export type ProfileRecord = {
  id: string;
  username: string | null;
  avatar_media_id: string | null;
  is_staff: boolean;
  deleted: boolean;
};

/** The flair shown on a profile card. */
export type ProfileFlair = {
  key: string;
  label: string;
  description: string | null;
  color_token: string;
  background_token: string;
  icon_key: string | null;
};

/**
 * What only the person sees of their own profile. Their name and picture are
 * their `ProfileRecord`, like everyone else's.
 */
export type MyProfile = {
  bio: string | null;
  active_flair_id: string | null;
};

/** A flair the person holds, with what it looks like. */
export type HeldFlair = UserFlair & { flair: Flair };

/** A person's card. Bio and flair are null unless `details_visible`. */
export type ProfileCardRecord = ProfileRecord & {
  details_visible: boolean;
  bio: string | null;
  flair: ProfileFlair | null;
  mutual_community_names: string[];
  is_friend: boolean;
  /** The database's answer: offer "Message" only when true. */
  can_message: boolean;
  /** The database's answer: offer "Add friend" only when true. */
  can_friend_request: boolean;
};

/** Who a friend link is from, shown before the person decides. */
export type FriendLinkRecord = {
  owner_id: string;
  username: string;
  avatar_media_id: string | null;
  already_friends: boolean;
};

/** One stored file: an upload slot, a message attachment, an avatar. */
export type MediaRecord = {
  id: string;
  bucket: string;
  object_path: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

export type MessageReaction = { emoji: string; user_ids: string[] };

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  site_name: string | null;
  /** Path of the cached picture in the public `previews` bucket. */
  image_path: string | null;
  embed_provider: "youtube" | "vimeo" | null;
  embed_id: string | null;
};

/**
 * A message. Every read returns this and every realtime event carries it, so
 * a change to its files, reactions or link preview is "this message changed".
 * `community_id` is null in a direct conversation.
 */
export type MessageRecord = {
  id: string;
  channel_id: string;
  community_id: string | null;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  /** True while the author is banned from this community. */
  hidden: boolean;
  attachments: MediaRecord[];
  reactions: MessageReaction[];
  link_preview: LinkPreview | null;
  /** What the sending app named this send; null for messages no app sent. */
  nonce: string | null;
};

type SnapshotPerson = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_media_id: string | null;
};

/**
 * What the database wrote down when a report was filed. A report about a
 * message has all of it; a report about a person has only `profile`.
 */
export type ReportSnapshot = {
  message?: {
    id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    attachments: {
      media_id: string;
      filename: string | null;
      mime_type: string;
    }[];
  };
  author?: SnapshotPerson;
  channel?: { id: string; kind: ChannelKind; name: string | null };
  community?: { id: string; name: string } | null;
  /** Up to ten messages before and ten after the reported one. */
  context?: {
    id: string;
    author_id: string;
    username: string | null;
    body: string;
    created_at: string;
  }[];
  profile?: SnapshotPerson;
};

/** A community report as its moderators see it. It never says who filed it. */
export type CommunityReportRecord = {
  id: string;
  community_id: string;
  subject_kind: ReportSubject;
  subject_user_id: string;
  subject_message_id: string | null;
  reason: string | null;
  snapshot: ReportSnapshot;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
};

/** A report the caller filed. `audience` is who it went to. */
export type MyReport = {
  id: string;
  audience: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/** A staff decision about the caller. */
export type DecisionAboutMe = {
  case_id: string;
  actions: CaseAction[];
  rule: string;
  reason: string;
  restricted_until: string | null;
  decided_at: string;
};

export type UnreadCount = { channel_id: string; unread: number };
export type FeatureFlag = { key: string; enabled: boolean };
export type { Json };

// ── The typecheck that keeps the hand-written records honest ────────────────
type SameFields<Ours, Generated> = [keyof Ours] extends [keyof Generated]
  ? [keyof Generated] extends [keyof Ours]
    ? true
    : { missing: Exclude<keyof Generated, keyof Ours> }
  : { unknown: Exclude<keyof Ours, keyof Generated> };

type Expect<T extends true> = T;

export type RecordsMatchDatabase = [
  Expect<SameFields<ProfileRecord, CompositeTypes<"profile_record">>>,
  Expect<SameFields<ProfileCardRecord, CompositeTypes<"profile_card_record">>>,
  Expect<SameFields<MyProfile, CompositeTypes<"my_profile_record">>>,
  Expect<SameFields<FriendLinkRecord, CompositeTypes<"friend_link_record">>>,
  Expect<SameFields<MediaRecord, CompositeTypes<"media_record">>>,
  Expect<SameFields<MessageRecord, CompositeTypes<"message_record">>>,
  Expect<
    SameFields<CommunityReportRecord, CompositeTypes<"community_report_record">>
  >,
];
