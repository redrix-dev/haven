import { describe, expect, it, vi } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend";
import { ChannelSolidNexus } from "../../data/channels/channelSolidNexus";
import { ProfileSolidNexus } from "../../data/profile/profileSolidNexus";
import { expectRenderSettles } from "../renderSettleHarness";

// RED-50 Tier-2 coverage for the community-settings and profile surfaces.
//
// Each surface gets a PAIR: the naked shape (proving the dependency leak is
// real and this harness detects it) and the shipped untracked shape (proving
// untrack is what removes it). A single passing test here would be worthless —
// these methods settle even when naked, because inflight maps happen to
// swallow the retrigger. The pair is what makes the assertion mean something:
// naked costs an extra effect run, untracked does not.

function memoryPersistence(): NexusPersistence {
  const mem = new Map<string, string>();
  return {
    getString: (k) => mem.get(k) ?? null,
    set: (k, v) => void mem.set(k, v),
    remove: (k) => void mem.delete(k),
  };
}

function makeChannelNexus(channels: unknown[]) {
  const listChannels = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 0));
    return channels;
  });
  const backend = {
    listChannels,
    listChannelGroups: async () => ({
      groups: [],
      ungroupedChannelIds: [],
      collapsedGroupIds: [],
    }),
  } as unknown as CommunityDataBackend;
  return {
    nexus: new ChannelSolidNexus(memoryPersistence(), backend),
    listChannels,
  };
}

function makeProfileNexus() {
  const slow = async <T>(v: T): Promise<T> => {
    await new Promise((r) => setTimeout(r, 0));
    return v;
  };
  const controlPlane = {
    fetchUserProfile: vi.fn(async (id: string) =>
      slow({ userId: id, displayName: "probe" }),
    ),
    listMyUserFlairs: vi.fn(async () => slow([])),
    fetchProfileCard: vi.fn(async () => slow(null)),
    fetchPlatformStaff: vi.fn(async () => slow(null)),
    getPlatformStaff: vi.fn(async () => slow(null)),
  } as unknown as ControlPlaneBackend;
  return { nexus: new ProfileSolidNexus(controlPlane), controlPlane };
}

describe("CommunityChannelsTab ensureLoaded — settle (RED-50 Tier 2)", () => {
  it("NEGATIVE CONTROL: bare ensureLoaded leaks byCommunity and costs a rerun", async () => {
    const { nexus } = makeChannelNexus([]);
    const result = await expectRenderSettles((shouldContinue) => {
      const [communityId] = createSignal("community-1");
      createEffect(() => {
        if (!shouldContinue()) return;
        void nexus.ensureLoaded(communityId());
      });
      return null;
    });
    // ensureLoaded reads state.byCommunity before its first await, so the
    // load's own write retriggers the effect. inflight stops it running away,
    // but the extra run is the leak made visible.
    expect(result.runs).toBe(2);
  });

  it("the shipped untracked shape settles in a single run", async () => {
    const { nexus, listChannels } = makeChannelNexus([]);
    const result = await expectRenderSettles((shouldContinue) => {
      const [communityId] = createSignal("community-1");
      createEffect(() => {
        if (!shouldContinue()) return;
        const id = communityId();
        untrack(() => void nexus.ensureLoaded(id));
      });
      return null;
    });
    expect(result.runs).toBe(1);
    expect(listChannels).toHaveBeenCalledTimes(1);
  });
});

describe("ProfileSettings load — settle (RED-50 Tier 2)", () => {
  const loadAll = (nexus: ProfileSolidNexus, id: string) =>
    Promise.allSettled([
      nexus.ensureViewerProfile(id),
      nexus.ensureMyUserFlairs(id),
      nexus.loadProfileCard(id),
      nexus.ensurePlatformStaff(id),
    ]);

  it("NEGATIVE CONTROL: bare load leaks three stores and costs a rerun", async () => {
    const { nexus } = makeProfileNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      const [userId] = createSignal("user-1");
      createEffect(() => {
        if (!shouldContinue()) return;
        const id = userId();
        if (id) void loadAll(nexus, id);
      });
      return null;
    });
    // ensureViewerProfile / ensureMyUserFlairs / ensurePlatformStaff each read
    // their store (and a freshness stamp) before awaiting — the 86a20e0 shape.
    expect(result.runs).toBe(2);
  });

  it("the shipped untracked shape settles in a single run", async () => {
    const { nexus, controlPlane } = makeProfileNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      const [userId] = createSignal("user-1");
      createEffect(() => {
        if (!shouldContinue()) return;
        const id = userId();
        if (!id) return;
        untrack(() => void loadAll(nexus, id));
      });
      return null;
    });
    expect(result.runs).toBe(1);
    expect(controlPlane.fetchUserProfile).toHaveBeenCalledTimes(1);
  });
});
