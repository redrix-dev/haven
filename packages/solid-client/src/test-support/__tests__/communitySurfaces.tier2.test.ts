import { describe, expect, it, vi } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { ChannelSolidNexus } from "../../data/channels/channelSolidNexus";
import { CommunitySolidNexus } from "../../data/communities/communitySolidNexus";
import { CommunityAdminSolidNexus } from "../../data/community-management/communityAdminSolidNexus";
import { expectRenderSettles } from "../renderSettleHarness";

// Settle coverage for the community route sync and the members panel. Each
// surface gets the naked negative control (shared nexus methods read the live
// store before their first await, so their own writes retrigger the effect)
// and the shipped untracked shape. Modmail's moderation.load reads nothing
// before its await and measures one run either way, so it has no pair here.

const slow = async <T>(value: T): Promise<T> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return value;
};

function memoryPersistence(): NexusPersistence {
  const mem = new Map<string, string>();
  return {
    getString: (key) => mem.get(key) ?? null,
    set: (key, value) => void mem.set(key, value),
    remove: (key) => void mem.delete(key),
  };
}

type Wrap = (shouldContinue: () => boolean, work: () => void) => void;
const naked: Wrap = (shouldContinue, work) => {
  if (shouldContinue()) work();
};
const untracked: Wrap = (shouldContinue, work) => {
  if (shouldContinue()) untrack(work);
};

function routeSync(wrap: Wrap) {
  const listChannels = vi.fn(async () => slow([]));
  const channels = new ChannelSolidNexus(memoryPersistence(), {
    listChannels,
    listChannelGroups: async () => ({
      groups: [],
      ungroupedChannelIds: [],
      collapsedGroupIds: [],
    }),
  } as never);
  const communities = new CommunitySolidNexus(memoryPersistence(), {
    listUserCommunities: async () => [],
  } as never);
  const settled = expectRenderSettles((shouldContinue) => {
    const [params] = createSignal({ communityId: "c1", channelId: "ch1" });
    createEffect(() => {
      const { communityId, channelId } = params();
      wrap(shouldContinue, () => {
        communities.setActiveId(communityId);
        channels.setActiveChannelId(channelId);
        void channels.ensureLoaded(communityId);
      });
    });
    return null;
  });
  return { settled, listChannels };
}

function membersPanel(wrap: Wrap, load: "members" | "bans") {
  const listCommunityMembers = vi.fn(async () => slow([]));
  const listCommunityBans = vi.fn(async () => slow([]));
  const admin = new CommunityAdminSolidNexus(
    { listCommunityMembers, listCommunityBans } as never,
    {} as never,
  );
  const settled = expectRenderSettles((shouldContinue) => {
    const [communityId] = createSignal("c1");
    createEffect(() => {
      const id = communityId();
      wrap(shouldContinue, () =>
        load === "members"
          ? void admin.ensureMembersLoaded(id)
          : void admin.loadBans(id),
      );
    });
    return null;
  });
  return {
    settled,
    fetch: load === "members" ? listCommunityMembers : listCommunityBans,
  };
}

describe("community route sync — settle", () => {
  it("NEGATIVE CONTROL: the bare sync leaks channel state and costs reruns", async () => {
    const { settled, listChannels } = routeSync(naked);
    // setActiveChannelId reads lastChannelByCommunity and ensureLoaded reads
    // byCommunity; the load's writes retrigger. The gate keeps it to one fetch.
    expect((await settled).runs).toBe(3);
    expect(listChannels).toHaveBeenCalledTimes(1);
  });

  it("the shipped untracked shape settles in a single run", async () => {
    const { settled, listChannels } = routeSync(untracked);
    expect((await settled).runs).toBe(1);
    expect(listChannels).toHaveBeenCalledTimes(1);
  });
});

describe("members panel loads — settle", () => {
  it("NEGATIVE CONTROL: a bare member load leaks the cache and costs reruns", async () => {
    const { settled, fetch } = membersPanel(naked, "members");
    expect((await settled).runs).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("the shipped untracked member load settles in a single run", async () => {
    const { settled } = membersPanel(untracked, "members");
    expect((await settled).runs).toBe(1);
  });

  it("NEGATIVE CONTROL: a bare ban load leaks its status and costs a rerun", async () => {
    const { settled, fetch } = membersPanel(naked, "bans");
    expect((await settled).runs).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("the shipped untracked ban load settles in a single run", async () => {
    const { settled } = membersPanel(untracked, "bans");
    expect((await settled).runs).toBe(1);
  });
});
