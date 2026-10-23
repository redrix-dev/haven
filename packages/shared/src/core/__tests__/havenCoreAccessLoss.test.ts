import { describe, expect, it, vi } from "vitest";
import type { CommunityAccessLoss } from "@shared/core/havenCore";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import { createTestHavenCore, flushAsync } from "./testHavenCore";

const server = (id: string, name = `Community ${id}`) => ({
  id,
  name,
  created_at: "2026-10-01T00:00:00.000Z",
});

const channel = (id: string, communityId: string, position: number) => ({
  id,
  community_id: communityId,
  name: id,
  kind: "text",
  position,
  topic: null,
  created_at: "2026-10-01T00:00:00.000Z",
});

/** A core whose community list is whatever `lists` hands out, one per load. */
function coreWithCommunityLists(lists: ReturnType<typeof server>[][]) {
  const listUserCommunities = vi.fn(async () => lists.shift() ?? []);
  return createTestHavenCore({
    controlPlane: {
      listUserCommunities,
      leaveCommunity: async () => {},
    },
    communityData: {
      listChannels: async (communityId: string) => [
        channel(`${communityId}-general`, communityId, 0),
      ],
      listChannelGroups: async () => ({
        groups: [],
        ungroupedChannelIds: [],
        collapsedGroupIds: [],
      }),
    },
  });
}

describe("HavenCore community access loss", () => {
  it("forgets a community a reload dropped, refocuses, and tells the platform", async () => {
    const { core, persistence } = coreWithCommunityLists([
      [server("c1", "Book Club"), server("c2")],
      [server("c2")],
    ]);
    const losses: CommunityAccessLoss[] = [];
    core.subscribeCommunityAccessLost((loss) => losses.push(loss));

    await core.communities.load("u1");
    core.communities.setActiveId("c1");
    await core.channels.loadForCommunity("c1");
    persistence.set(NEXUS_STORAGE_KEYS.communityMessages("c1"), "{}");

    await core.communities.load("u1");

    expect(losses).toEqual([
      {
        communityId: "c1",
        communityName: "Book Club",
        wasActive: true,
        inVoice: false,
      },
    ]);
    expect(core.communities.getActiveId()).toBe("c2");
    expect(core.channels.getChannels("c1")).toEqual([]);
    // Its messages are gone from the device too, not just from memory.
    expect(
      persistence.getString(NEXUS_STORAGE_KEYS.communityMessages("c1")),
    ).toBeNull();
  });

  it("flags a loss while in that community's voice channel", async () => {
    const { core } = coreWithCommunityLists([
      [server("c1"), server("c2")],
      [server("c2")],
    ]);
    const losses: CommunityAccessLoss[] = [];
    core.subscribeCommunityAccessLost((loss) => losses.push(loss));

    await core.communities.load("u1");
    core.voice.startConnect({ id: "v1", name: "Lounge", community_id: "c1" });
    await core.communities.load("u1");

    expect(losses[0]).toMatchObject({
      communityId: "c1",
      inVoice: true,
      wasActive: false,
    });
  });

  it("does not report a community the viewer left", async () => {
    const { core } = coreWithCommunityLists([
      [server("c1"), server("c2")],
      [server("c2")],
    ]);
    const listener = vi.fn();
    core.subscribeCommunityAccessLost(listener);
    await core.communities.load("u1");
    // leaveCommunity needs a signed-in user; bootstrapSession would set this.
    (core as unknown as { sessionUserId: string }).sessionUserId = "u1";

    await core.leaveCommunity("c1");

    expect(listener).not.toHaveBeenCalled();
    expect(core.communities.getCommunityIds()).toEqual(["c2"]);
  });

  it("holds losses found before anyone subscribed for the first subscriber", async () => {
    const { core } = coreWithCommunityLists([
      [server("c1"), server("c2")],
      [server("c2")],
    ]);
    await core.communities.load("u1");
    await core.communities.load("u1");

    const first = vi.fn();
    const second = vi.fn();
    core.subscribeCommunityAccessLost(first);
    core.subscribeCommunityAccessLost(second);

    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: "c1" }),
    );
    expect(second).not.toHaveBeenCalled();
  });
});

describe("HavenCore sign-out during a load", () => {
  it("keeps a load that finishes after clearSession out of the cleared state", async () => {
    let answer!: (list: ReturnType<typeof server>[]) => void;
    const { core } = createTestHavenCore({
      controlPlane: {
        listUserCommunities: () =>
          new Promise<ReturnType<typeof server>[]>((resolve) => {
            answer = resolve;
          }),
      },
    });

    const load = core.communities.load("previous-user");
    await core.clearSession();
    answer([server("c1", "Previous user's community")]);
    await load;

    expect(core.communities.getCommunityIds()).toEqual([]);
  });
});

describe("HavenCore role change", () => {
  it("reloads the channel list and moves off a channel that was hidden", async () => {
    let visible = [channel("ch-a", "c1", 0), channel("ch-b", "c1", 1)];
    const { core } = createTestHavenCore({
      communityData: {
        listChannels: async () => visible,
        listChannelGroups: async () => ({
          groups: [],
          ungroupedChannelIds: visible.map((c) => c.id),
          collapsedGroupIds: [],
        }),
        getMyPermissions: async () => ({}),
        listChannelRevokedUserIds: async () => [],
      },
    });
    await core.channels.loadForCommunity("c1");
    core.channels.setActiveChannelId("ch-a");
    const messages = core.messages.for("c1");
    const evict = vi.spyOn(messages, "evictChannel");

    visible = [channel("ch-b", "c1", 1)];
    core.onRoleChange("c1");
    await flushAsync();

    expect(core.channels.getChannels("c1").map((c) => c.id)).toEqual(["ch-b"]);
    expect(core.channels.getActiveChannelId()).toBe("ch-b");
    expect(evict).toHaveBeenCalledWith("ch-a");
  });
});
