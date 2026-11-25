// Loads that answer an event or a reconnect: each one is newer than any load
// already running, so the older answer must not land after it. And profiles
// are asked for in batches the database takes.
import { describe, expect, it, vi } from "vitest";
import type { CommunityStructure } from "@shared/lib/backend/communities";
import { Channels, createChannelsState } from "../channels/channels";
import {
  Communities,
  createCommunitiesState,
} from "../communities/communities";
import { createPlainStatePort } from "../kit/statePort";
import { createMessagesState, Messages } from "../messages/messages";
import {
  createProfilesState,
  PROFILE_BATCH,
  Profiles,
} from "../profiles/profiles";
import {
  channel,
  community,
  deferred,
  message,
  profile,
  tid,
} from "./fixtures";

/**
 * Starts a load whose answer is held back, then the same load again, which
 * answers at once; then lets the first answer arrive. What is held must be
 * the second answer.
 */
async function newerWins<T>(
  mock: {
    mockReturnValueOnce(value: Promise<T>): unknown;
    mockResolvedValueOnce(value: T): unknown;
  },
  load: () => Promise<void>,
  older: T,
  newer: T,
  check: () => void,
) {
  const held = deferred<T>();
  mock.mockReturnValueOnce(held.promise);
  mock.mockResolvedValueOnce(newer);
  const first = load();
  await load();
  held.resolve(older);
  await first;
  check();
}

const structure = (name: string): CommunityStructure => ({
  community: community("hearth", { name }),
  members: [],
  roles: [],
  role_permissions: [],
  member_roles: [],
  categories: [],
  collapsed_category_ids: [],
});

describe("a newer load wins", () => {
  function communities() {
    const port = createPlainStatePort(createCommunitiesState());
    const backend = {
      listMyCommunities: vi.fn(),
      loadCommunity: vi.fn(),
      getMyPermissions: vi.fn(async () => []),
    };
    return {
      port,
      backend,
      communities: new Communities(port, backend as never, []),
    };
  }

  it("the community list", async () => {
    const { port, backend, communities: c } = communities();
    await newerWins(
      backend.listMyCommunities,
      () => c.loadMine(),
      [community("old")],
      [community("new")],
      () => expect(Object.keys(port.get().byId)).toEqual(["new"]),
    );
  });

  it("one community", async () => {
    const { port, backend, communities: c } = communities();
    await newerWins(
      backend.loadCommunity,
      () => c.loadCommunity("hearth"),
      structure("Old"),
      structure("New"),
      () => expect(port.get().byId.hearth?.name).toBe("New"),
    );
  });

  function channels() {
    const port = createPlainStatePort(createChannelsState());
    const backend = {
      listCommunityChannels: vi.fn(),
      listConversations: vi.fn(),
      listMyChannelState: vi.fn(async () => []),
      getUnreadCounts: vi.fn(),
    };
    return { port, backend, channels: new Channels(port, backend as never) };
  }

  it("a community's channels", async () => {
    const { port, backend, channels: c } = channels();
    await newerWins(
      backend.listCommunityChannels,
      () => c.loadCommunity("hearth"),
      [channel("old")],
      [channel("new")],
      () => expect(Object.keys(port.get().byId)).toEqual(["new"]),
    );
  });

  it("the conversations", async () => {
    const { port, backend, channels: c } = channels();
    const dm = (id: string) => channel(id, { kind: "dm", community_id: null });
    await newerWins(
      backend.listConversations,
      () => c.loadConversations(),
      { channels: [dm("old")], participants: [] },
      { channels: [dm("new")], participants: [] },
      () => expect(Object.keys(port.get().byId)).toEqual(["new"]),
    );
  });

  it("read marks and unread counts", async () => {
    const { port, backend, channels: c } = channels();
    await newerWins(
      backend.getUnreadCounts,
      () => c.loadMine(),
      [{ channel_id: "general", unread: 9 }],
      [{ channel_id: "general", unread: 1 }],
      () => expect(port.get().unread.general).toBe(1),
    );
  });

  it("a channel's newest page", async () => {
    const port = createPlainStatePort(createMessagesState());
    const backend = { listMessages: vi.fn(), getLatestMessages: vi.fn() };
    const m = new Messages(port, backend as never);
    await newerWins(
      backend.listMessages,
      () => m.loadNewest("general"),
      [message(1)],
      [message(2)],
      () => expect(port.get().windows.general?.ids).toEqual([tid(2)]),
    );
  });
});

describe("profiles", () => {
  function profiles() {
    const port = createPlainStatePort(createProfilesState());
    const backend = {
      getProfiles: vi.fn(async (ids: string[]) => ids.map((id) => profile(id))),
      getProfileCard: vi.fn(),
    };
    return { port, backend, profiles: new Profiles(port, backend) };
  }

  it("asks for at most a batch of people at a time", async () => {
    const { port, backend, profiles: p } = profiles();
    const ids = Array.from(
      { length: PROFILE_BATCH + 1 },
      (_, i) => `p${String(i).padStart(3, "0")}`,
    );
    await p.ensure(ids);
    expect(backend.getProfiles).toHaveBeenCalledTimes(2);
    expect(
      backend.getProfiles.mock.calls.map(([batch]) => batch.length),
    ).toEqual([PROFILE_BATCH, 1]);
    expect(Object.keys(port.get().byId)).toHaveLength(PROFILE_BATCH + 1);
  });

  it("asks again for everyone held after a reconnect", async () => {
    const { port, backend, profiles: p } = profiles();
    await p.ensure(["ana", "ben"]);
    backend.getProfiles.mockResolvedValueOnce([
      profile("ana", { username: "ana_renamed" }),
      profile("ben"),
    ]);
    await p.reloadHeld();
    expect(backend.getProfiles).toHaveBeenLastCalledWith(["ana", "ben"]);
    expect(port.get().byId.ana?.username).toBe("ana_renamed");
    // And ensure still asks nothing more for them.
    await p.ensure(["ana"]);
    expect(backend.getProfiles).toHaveBeenCalledTimes(2);
  });
});
