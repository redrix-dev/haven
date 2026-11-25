/** Records for collection tests, shaped exactly like the database's. */

import type { CommunityStructure } from "@shared/lib/backend/communities";
import type { MyAccount } from "@shared/lib/backend/people";
import type {
  Block,
  Channel,
  ChannelCategory,
  Community,
  CommunityMember,
  CommunityReportNote,
  CommunityReportRecord,
  FriendLink,
  FriendRequest,
  Friendship,
  HeldFlair,
  MessageRecord,
  Notification,
  OnboardingCampaign,
  PlatformCase,
  ProfileRecord,
  Role,
} from "@shared/lib/backend/records";

/** A time-ordered id: a bigger `n` was made later, as with UUIDv7. */
export const tid = (n: number) =>
  `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;

export function message(
  n: number,
  change: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id: tid(n),
    channel_id: "general",
    community_id: "hearth",
    author_id: "ana",
    body: `message ${n}`,
    reply_to_id: null,
    created_at: "2026-11-14T12:00:00Z",
    edited_at: null,
    hidden: false,
    attachments: [],
    reactions: [],
    link_preview: null,
    nonce: null,
    ...change,
  };
}

export function channel(id: string, change: Partial<Channel> = {}): Channel {
  return {
    id,
    community_id: "hearth",
    kind: "text",
    name: id,
    topic: null,
    category_id: null,
    position: 0,
    direct_key: null,
    latest_message_id: null,
    created_at: "2026-11-14T12:00:00Z",
    ...change,
  };
}

/** A promise the test resolves when it chooses. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Messages `from` to `to`, newest first: the order `list_messages` sends. */
export const newestFirst = (from: number, to: number, change = {}) =>
  Array.from({ length: to - from + 1 }, (_, i) => message(to - i, change));

const AT = "2026-11-14T12:00:00Z";

export function community(
  id: string,
  change: Partial<Community> = {},
): Community {
  return {
    id,
    name: id,
    description: null,
    owner_id: "owner",
    invites_enabled: true,
    report_reason_required: false,
    created_at: AT,
    updated_at: AT,
    ...change,
  };
}

export function member(
  userId: string,
  change: Partial<CommunityMember> = {},
): CommunityMember {
  return {
    community_id: "hearth",
    user_id: userId,
    nickname: null,
    joined_at: AT,
    ...change,
  };
}

export function role(id: string, change: Partial<Role> = {}): Role {
  return {
    id,
    community_id: "hearth",
    name: id,
    color: "#888888",
    position: 1,
    is_everyone: false,
    created_at: AT,
    updated_at: AT,
    ...change,
  };
}

export function category(
  id: string,
  change: Partial<ChannelCategory> = {},
): ChannelCategory {
  return {
    id,
    community_id: "hearth",
    name: id,
    position: 0,
    created_at: AT,
    ...change,
  };
}

/** What `loadCommunity` answers, empty unless given. */
export function structure(
  communityId: string,
  change: Partial<Omit<CommunityStructure, "community">> = {},
): CommunityStructure {
  return {
    community: community(communityId),
    members: [],
    roles: [],
    role_permissions: [],
    member_roles: [],
    categories: [],
    collapsed_category_ids: [],
    ...change,
  };
}

export function profile(
  id: string,
  change: Partial<ProfileRecord> = {},
): ProfileRecord {
  return {
    id,
    username: id,
    avatar_media_id: null,
    is_staff: false,
    deleted: false,
    ...change,
  };
}

export function friendRequest(
  id: string,
  senderId: string,
  recipientId: string,
): FriendRequest {
  return { id, sender_id: senderId, recipient_id: recipientId, created_at: AT };
}

/** One of "me"'s friend links: one use, a week from AT, unless changed. */
export function friendLink(
  id: string,
  change: Partial<FriendLink> = {},
): FriendLink {
  return {
    id,
    owner_id: "me",
    code: `CODE${id.toUpperCase()}`,
    max_uses: 1,
    uses: 0,
    expires_at: "2026-11-21T12:00:00Z",
    expiry_noticed_at: null,
    created_at: AT,
    ...change,
  };
}

/** A friendship between two people, smaller id first as the database stores it. */
export function friendship(a: string, b: string): Friendship {
  const [low, high] = a < b ? [a, b] : [b, a];
  return { user_low_id: low, user_high_id: high, created_at: AT };
}

export function block(blockerId: string, blockedId: string): Block {
  return { blocker_id: blockerId, blocked_id: blockedId, created_at: AT };
}

export function notification(
  n: number,
  change: Partial<Notification> = {},
): Notification {
  return {
    id: tid(n),
    recipient_id: "me",
    kind: "mention",
    title: `notification ${n}`,
    body: "",
    actor_id: null,
    community_id: null,
    channel_id: null,
    message_id: null,
    case_id: null,
    in_app: true,
    sound: true,
    push: false,
    seen_at: null,
    read_at: null,
    dismissed_at: null,
    created_at: AT,
    ...change,
  };
}

/** A flair "me" holds, by key. */
export function heldFlair(
  key: string,
  change: { expires_at?: string | null; retired_at?: string | null } = {},
): HeldFlair {
  return {
    user_id: "me",
    flair_id: key,
    source: "staff",
    granted_at: "2026-11-14T12:00:00Z",
    expires_at: change.expires_at ?? null,
    flair: {
      id: key,
      key,
      label: key,
      description: null,
      color_token: "primary",
      background_token: "surface-card",
      icon_key: null,
      community_id: null,
      retired_at: change.retired_at ?? null,
      created_at: "2026-11-01T00:00:00Z",
    },
  };
}

export function campaign(
  key: string,
  change: Partial<OnboardingCampaign> = {},
): OnboardingCampaign {
  return {
    key,
    title: key,
    description: null,
    required: false,
    flag_key: null,
    community_id: null,
    flair_id: null,
    platforms: [],
    distributions: [],
    min_app_version: null,
    max_app_version: null,
    active: true,
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    ...change,
  };
}

/** "me", signed up under the first terms, with nothing else yet. */
export function myAccount(change: Partial<MyAccount> = {}): MyAccount {
  return {
    settings: {
      user_id: "me",
      theme: "default",
      details_visible_to: "friends",
      dms_from: "friends",
      friend_requests_from: "nobody",
      updated_at: "2026-11-14T12:00:00Z",
    },
    profile: { bio: null, active_flair_id: null },
    terms_versions: [
      { version: "2026-03-24", published_at: "2026-03-24T00:00:00Z" },
    ],
    terms_accepted: [
      {
        user_id: "me",
        version: "2026-03-24",
        accepted_at: "2026-11-01T00:00:00Z",
      },
    ],
    flairs: [],
    feature_flags: [],
    onboarding: [],
    ...change,
  };
}

/** A report in hearth, about a message by "zed", waiting on a moderator. */
export function communityReport(
  id: string,
  change: Partial<CommunityReportRecord> = {},
): CommunityReportRecord {
  return {
    id,
    community_id: "hearth",
    subject_kind: "message",
    subject_user_id: "zed",
    subject_message_id: `m-${id}`,
    reason: null,
    snapshot: {},
    status: "open",
    created_at: AT,
    updated_at: AT,
    ...change,
  };
}

export function reportNote(id: string, reportId: string): CommunityReportNote {
  return {
    id,
    report_id: reportId,
    author_id: "me",
    body: `note ${id}`,
    created_at: AT,
  };
}

/** A platform case about "zed", open. */
export function platformCase(
  id: string,
  change: Partial<PlatformCase> = {},
): PlatformCase {
  return {
    id,
    source: "message",
    status: "open",
    subject_user_id: "zed",
    subject_message_id: null,
    community_id: null,
    community_report_id: null,
    reporter_id: null,
    reason: null,
    snapshot: {},
    csam_flagged_at: null,
    csam_flagged_by: null,
    ncmec_report_id: null,
    preserve_until: null,
    created_at: AT,
    updated_at: AT,
    ...change,
  };
}
