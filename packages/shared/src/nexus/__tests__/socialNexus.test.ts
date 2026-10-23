import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import { createPlainStatePort } from "../kit/statePort";
import { SocialNexus, createInitialSocialState } from "../social/socialNexus";

const makeBackend = (overrides: Record<string, unknown> = {}) =>
  ({
    getSocialCounts: vi.fn(async () => DEFAULT_SOCIAL_COUNTS),
    listMyBlocks: vi.fn(async () => ["blocked"]),
    listUsersBlockingMe: vi.fn(async () => ["blocker"]),
    listFriends: vi.fn(async () => []),
    listFriendRequests: vi.fn(async () => []),
    listBlockedUsers: vi.fn(async () => []),
    blockUser: vi.fn(async () => true),
    unblockUser: vi.fn(async () => true),
    ...overrides,
  }) as never;

const setup = (overrides: Record<string, unknown> = {}) => {
  const port = createPlainStatePort(createInitialSocialState());
  const backend = makeBackend(overrides);
  return { port, backend, nexus: new SocialNexus(port, backend) };
};

describe("SocialNexus", () => {
  it("fires policy sync once per load, after hidden authors are set", async () => {
    const { nexus } = setup();
    const seen: string[][] = [];
    nexus.setPolicySyncCallback(() =>
      seen.push([...nexus.getHiddenAuthorIdsForViewer()]),
    );

    await nexus.load();

    expect(seen).toEqual([["blocked", "blocker"]]);
  });

  it("ensureLoaded joins a load already in flight instead of firing a second one", async () => {
    const { nexus, backend } = setup();
    const getSocialCounts = (
      backend as { getSocialCounts: ReturnType<typeof vi.fn> }
    ).getSocialCounts;

    await Promise.all([nexus.load(), nexus.ensureLoaded()]);

    expect(getSocialCounts).toHaveBeenCalledTimes(1);
  });

  it("ensureLoaded skips a load inside the freshness window", async () => {
    const { nexus, backend } = setup();
    const getSocialCounts = (
      backend as { getSocialCounts: ReturnType<typeof vi.fn> }
    ).getSocialCounts;

    await nexus.load();
    await nexus.ensureLoaded();

    expect(getSocialCounts).toHaveBeenCalledTimes(1);
  });

  it("hides a blocked author immediately and syncs policy before the reload", async () => {
    let releaseReload: () => void = () => {};
    const { nexus } = setup({
      listMyBlocks: vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            releaseReload = () => resolve(["blocked", "new"]);
          }),
      ),
    });
    const policySync = vi.fn();
    nexus.setPolicySyncCallback(policySync);

    const blocking = nexus.blockUser("new");
    await vi.waitFor(() => expect(policySync).toHaveBeenCalled());

    expect(nexus.getHiddenAuthorIdsForViewer().has("new")).toBe(true);
    releaseReload();
    await blocking;
  });

  it("clear resets state and never hands out the shared default counts object", async () => {
    const { nexus, port } = setup();
    await nexus.load();

    nexus.clear();

    expect(port.get()).toEqual(createInitialSocialState());
    expect(port.get().counts).not.toBe(DEFAULT_SOCIAL_COUNTS);
  });
});
