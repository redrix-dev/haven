import { vi } from "vitest";
import type { Backend } from "@shared/lib/backend";
import type { MyEventsOptions } from "@shared/lib/backend/realtime";
import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import { HavenSolidCore } from "../core/HavenSolidCore";

/** Answers after a macrotask, like the network: the async store-loop class needs it. */
const later = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 0));

const at = "2026-11-14T00:00:00.000Z";
export const tid = (n: number) =>
  `019a0000-0000-7000-8000-${String(n).padStart(12, "0")}`;

const channel = (id: string, change: Record<string, unknown> = {}) => ({
  id,
  community_id: "hearth",
  kind: "text",
  name: id,
  topic: null,
  category_id: null,
  position: 0,
  latest_message_id: tid(2),
  direct_key: null,
  created_at: at,
  ...change,
});

const message = (n: number, channelId = "general") => ({
  id: tid(n),
  channel_id: channelId,
  community_id: channelId === "dm" ? null : "hearth",
  author_id: "ana",
  body: `message ${n}`,
  reply_to_id: n === 2 ? tid(1) : null,
  created_at: at,
  edited_at: null,
  hidden: false,
  attachments: [
    {
      id: `file${n}`,
      bucket: "attachments",
      object_path: `m/${n}`,
      filename: null,
      mime_type: "image/png",
      size_bytes: 1,
      width: null,
      height: null,
    },
  ],
  reactions: [],
  link_preview: null,
  nonce: null,
});

const profile = (id: string) => ({
  id,
  username: id,
  avatar_media_id: null,
  is_staff: false,
  deleted: false,
});

/**
 * The real HavenSolidCore, its collections writing Solid stores, over a fake
 * backend whose every answer arrives a macrotask later. For settle tests
 * that drive the real commands screens call from effects.
 */
export function createSolidTestCore() {
  const backend = {
    people: {
      loadMyAccount: vi.fn(async () =>
        later({
          settings: null,
          profile: null,
          terms_versions: [],
          terms_accepted: [],
          flairs: [],
          feature_flags: [],
          onboarding: [],
        }),
      ),
      getProfiles: vi.fn(async (ids: string[]) => later(ids.map(profile))),
      getProfileCard: vi.fn(async (id: string) =>
        later({
          ...profile(id),
          details_visible: true,
          bio: null,
          flair: null,
          mutual_community_names: [],
          is_friend: false,
          can_message: true,
          can_friend_request: true,
        }),
      ),
    },
    communities: {
      listMyCommunities: vi.fn(async () => later([])),
      listInvites: vi.fn(async () => later([])),
      listBans: vi.fn(async () => later([])),
    },
    channels: {
      listCommunityChannels: vi.fn(async () => later([channel("general")])),
      listConversations: vi.fn(async () =>
        later({
          channels: [channel("dm", { kind: "dm", community_id: null })],
          participants: [],
        }),
      ),
      listMyChannelState: vi.fn(async () => later([])),
      getUnreadCounts: vi.fn(async () => later([])),
      markRead: vi.fn(async () => later(undefined)),
    },
    messages: {
      listMessages: vi.fn(async (channelId: string) =>
        later([message(2, channelId), message(1, channelId)]),
      ),
      getMessages: vi.fn(async (ids: string[]) =>
        later(ids.map((id) => ({ ...message(9), id }))),
      ),
      getLatestMessages: vi.fn(async (ids: string[]) =>
        later(ids.map((id) => message(2, id))),
      ),
    },
    media: {
      signedUrls: vi.fn(async (files: { id: string }[]) =>
        later(new Map(files.map((f) => [f.id, `https://signed/${f.id}`]))),
      ),
    },
    social: {
      listMyFriendLinks: vi.fn(async () => later([])),
      getFriendLink: vi.fn(async () =>
        later({
          owner_id: "ana",
          username: "ana",
          avatar_media_id: null,
          already_friends: false,
        }),
      ),
    },
    safety: {
      listReportNotes: vi.fn(async () => later([])),
      listCommunityReports: vi.fn(async () => later([])),
    },
    notifications: {},
    voice: {},
    realtime: {
      subscribeToMyEvents: vi.fn(
        (_userId: string, _options: MyEventsOptions) => () => {},
      ),
    },
  };
  const core = new HavenSolidCore({
    client: {} as HavenSupabaseClient,
    backend: backend as unknown as Backend,
    persistence: createMemoryPersistence(),
    context: { platform: "web" },
  });
  return { core, backend };
}
