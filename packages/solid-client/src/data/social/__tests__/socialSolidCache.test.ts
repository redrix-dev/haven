import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import { SocialSolidNexus } from "../socialSolidNexus";

const counts: SocialCounts = {
  friendsCount: 1,
  incomingPendingRequestCount: 1,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 1,
};

const friend = (id = "friend-1"): FriendSummary => ({
  friendUserId: id,
  username: "Ada",
  avatarUrl: null,
  friendshipCreatedAt: "2026-06-13T10:00:00.000Z",
  mutualCommunityCount: 1,
  mutualCommunityNames: ["General"],
});

const request = (id = "request-1"): FriendRequestSummary => ({
  requestId: id,
  direction: "incoming",
  status: "pending",
  senderUserId: "sender-1",
  senderUsername: "Grace",
  senderAvatarUrl: null,
  recipientUserId: "viewer-1",
  recipientUsername: "Viewer",
  recipientAvatarUrl: null,
  createdAt: "2026-06-13T10:01:00.000Z",
  mutualCommunityCount: 0,
  mutualCommunityNames: [],
});

const blocked = (id = "blocked-1"): BlockedUserSummary => ({
  blockedUserId: id,
  username: "Blocked",
  avatarUrl: null,
  blockedAt: "2026-06-13T10:02:00.000Z",
});

const searchResult = (id = "candidate-1"): FriendSearchResult => ({
  userId: id,
  username: "Candidate",
  avatarUrl: null,
  relationshipState: "none",
  pendingRequestId: null,
  mutualCommunityCount: 2,
  mutualCommunityNames: ["General", "Hangout"],
});

function createBackend(overrides: Partial<SocialBackend> = {}): SocialBackend {
  return {
    getSocialCounts: vi.fn().mockResolvedValue(counts),
    listFriends: vi.fn().mockResolvedValue([friend()]),
    listFriendRequests: vi.fn().mockResolvedValue([request()]),
    listBlockedUsers: vi.fn().mockResolvedValue([blocked()]),
    listMyBlocks: vi.fn().mockResolvedValue(["blocked-1"]),
    listUsersBlockingMe: vi.fn().mockResolvedValue(["blocker-1"]),
    searchUsersForFriendAdd: vi.fn().mockResolvedValue([]),
    sendFriendRequest: vi.fn().mockResolvedValue("request-1"),
    acceptFriendRequest: vi.fn().mockResolvedValue("friend-1"),
    declineFriendRequest: vi.fn().mockResolvedValue(true),
    cancelFriendRequest: vi.fn().mockResolvedValue(true),
    removeFriend: vi.fn().mockResolvedValue(true),
    blockUser: vi.fn().mockResolvedValue(true),
    unblockUser: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("SocialSolidNexus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads counts, friends, requests, blocked summaries, and viewer policy", async () => {
    const policySync = vi.fn();
    const backend = createBackend();
    const cache = new SocialSolidNexus(backend);
    cache.setPolicySyncCallback(policySync);

    await cache.load();

    expect(cache.state.counts).toEqual(counts);
    expect(cache.state.friends).toEqual([friend()]);
    expect(cache.state.requests).toEqual([request()]);
    expect(cache.state.blockedUsers).toEqual([blocked()]);
    expect(cache.state.myBlockedUserIds).toEqual(["blocked-1"]);
    expect(cache.state.usersBlockingMeIds).toEqual(["blocker-1"]);
    expect([...cache.getHiddenAuthorIdsForViewer()]).toEqual([
      "blocked-1",
      "blocker-1",
    ]);
    expect(policySync).toHaveBeenCalledTimes(1);
  });

  it("skips fresh ensureLoaded calls", async () => {
    const backend = createBackend();
    const cache = new SocialSolidNexus(backend);

    await cache.ensureLoaded();
    await cache.ensureLoaded();

    expect(backend.getSocialCounts).toHaveBeenCalledTimes(1);
    expect(backend.listFriends).toHaveBeenCalledTimes(1);
  });

  it("exposes loading state while a social load is pending", async () => {
    let resolveCounts: ((value: SocialCounts) => void) | null = null;
    const backend = createBackend({
      getSocialCounts: vi.fn(
        () =>
          new Promise<SocialCounts>((resolve) => {
            resolveCounts = resolve;
          }),
      ),
    });
    const cache = new SocialSolidNexus(backend);

    const load = cache.load();
    await Promise.resolve();
    expect(cache.state.isLoading).toBe(true);

    resolveCounts?.(counts);
    await load;
    expect(cache.state.isLoading).toBe(false);
  });

  it("updates hidden authors optimistically when blocking", async () => {
    const backend = createBackend({
      listMyBlocks: vi
        .fn()
        .mockResolvedValueOnce(["blocked-1"])
        .mockResolvedValueOnce(["blocked-1", "blocked-2"]),
    });
    const cache = new SocialSolidNexus(backend);
    await cache.load();

    await cache.blockUser("blocked-2");

    expect(backend.blockUser).toHaveBeenCalledWith("blocked-2");
    expect([...cache.getHiddenAuthorIdsForViewer()]).toContain("blocked-2");
  });

  it("forwards friend search queries without mutating cached lists", async () => {
    const result = searchResult();
    const backend = createBackend({
      searchUsersForFriendAdd: vi.fn().mockResolvedValue([result]),
    });
    const cache = new SocialSolidNexus(backend);

    const results = await cache.searchUsers("cand");

    expect(backend.searchUsersForFriendAdd).toHaveBeenCalledWith("cand");
    expect(results).toEqual([result]);
    expect(backend.getSocialCounts).not.toHaveBeenCalled();
    expect(cache.state.friends).toEqual([]);
  });

  it("reloads social summaries after request and friendship mutations", async () => {
    const backend = createBackend();
    const cache = new SocialSolidNexus(backend);

    await expect(cache.sendFriendRequest("Ada")).resolves.toBe("request-1");
    await expect(cache.acceptFriendRequest("request-1")).resolves.toBe(
      "friend-1",
    );
    await expect(cache.declineFriendRequest("request-2")).resolves.toBe(true);
    await expect(cache.cancelFriendRequest("request-3")).resolves.toBe(true);
    await expect(cache.removeFriend("friend-1")).resolves.toBe(true);
    await expect(cache.unblockUser("blocked-1")).resolves.toBeUndefined();

    expect(backend.sendFriendRequest).toHaveBeenCalledWith("Ada");
    expect(backend.acceptFriendRequest).toHaveBeenCalledWith("request-1");
    expect(backend.declineFriendRequest).toHaveBeenCalledWith("request-2");
    expect(backend.cancelFriendRequest).toHaveBeenCalledWith("request-3");
    expect(backend.removeFriend).toHaveBeenCalledWith("friend-1");
    expect(backend.unblockUser).toHaveBeenCalledWith("blocked-1");
    expect(backend.getSocialCounts).toHaveBeenCalledTimes(6);
    expect(backend.listFriends).toHaveBeenCalledTimes(6);
    expect(backend.listFriendRequests).toHaveBeenCalledTimes(6);
    expect(backend.listBlockedUsers).toHaveBeenCalledTimes(6);
  });
});
