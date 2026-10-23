import { describe, expect, it, vi } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import { SocialSolidNexus } from "../../data/social/socialSolidNexus";
import { expectRenderSettles } from "../renderSettleHarness";

// Settle coverage for the two effects that load the social graph: the DM
// friend picker (forced reload, freshnessMs 0) and the Friends view.
//
// Shared nexus getters read the live store on Solid, so ensureLoaded's
// freshness check (lastLoadedAt) joins a naked effect's deps, and every load
// writes a new lastLoadedAt. What stops a forced reload looping is timing: the
// write lands while the load gate is still open, so the rerun returns early
// without reading the store. That is a coincidence, not a defence. Each
// surface gets the naked negative control and the shipped untracked shape, as
// in settingsSurfaces.

function makeSocialNexus() {
  const slow = async <T>(v: T): Promise<T> => {
    await new Promise((r) => setTimeout(r, 0));
    return v;
  };
  const listFriends = vi.fn(async () => slow([]));
  const backend = {
    getSocialCounts: async () =>
      slow({
        friendsCount: 0,
        incomingPendingRequestCount: 0,
        outgoingPendingRequestCount: 0,
        blockedUserCount: 0,
      }),
    listMyBlocks: async () => slow([]),
    listUsersBlockingMe: async () => slow([]),
    listFriends,
    listFriendRequests: async () => slow([]),
    listBlockedUsers: async () => slow([]),
  } as unknown as SocialBackend;
  return { nexus: new SocialSolidNexus(backend), listFriends };
}

describe("DM friend picker social reload — settle", () => {
  it("NEGATIVE CONTROL: a bare forced reload leaks lastLoadedAt and costs a rerun", async () => {
    const { nexus, listFriends } = makeSocialNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      const [pickerOpen] = createSignal(true);
      createEffect(() => {
        if (!shouldContinue()) return;
        if (!pickerOpen()) return;
        void nexus.ensureLoaded({ freshnessMs: 0 });
      });
      return null;
    });
    // The rerun hits the open load gate and joins the in-flight load.
    expect(result.runs).toBe(2);
    expect(listFriends).toHaveBeenCalledTimes(1);
  });

  it("the shipped untracked shape settles in a single run and one fetch", async () => {
    const { nexus, listFriends } = makeSocialNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      const [pickerOpen] = createSignal(true);
      createEffect(() => {
        if (!shouldContinue()) return;
        if (!pickerOpen()) return;
        untrack(() => void nexus.ensureLoaded({ freshnessMs: 0 }));
      });
      return null;
    });
    expect(result.runs).toBe(1);
    expect(listFriends).toHaveBeenCalledTimes(1);
  });
});

describe("Friends view social load — settle", () => {
  it("NEGATIVE CONTROL: a bare load leaks lastLoadedAt and costs a rerun", async () => {
    const { nexus, listFriends } = makeSocialNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      createEffect(() => {
        if (!shouldContinue()) return;
        void nexus.ensureLoaded();
      });
      return null;
    });
    // The rerun finds the data fresh, so it costs a run but not a fetch.
    expect(result.runs).toBe(2);
    expect(listFriends).toHaveBeenCalledTimes(1);
  });

  it("the shipped untracked shape settles in a single run", async () => {
    const { nexus } = makeSocialNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      createEffect(() => {
        if (!shouldContinue()) return;
        untrack(() => void nexus.ensureLoaded());
      });
      return null;
    });
    expect(result.runs).toBe(1);
  });
});
