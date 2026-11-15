// Friends, blocks and notifications: the person's own circle and inbox.
import { describe, expect, it, vi } from "vitest";
import { HavenError } from "@shared/lib/backend/havenError";
import { createPlainStatePort } from "../kit/statePort";
import {
  createNotificationsState,
  INBOX_PAGE,
  Notifications,
} from "../notifications/notifications";
import { inboxNotifications, preferenceFor } from "../notifications/selectors";
import {
  friendIds,
  incomingRequests,
  isBlocked,
  isFriend,
  outgoingRequests,
  usableLinks,
} from "../social/selectors";
import { createSocialState, Social } from "../social/social";
import {
  block,
  deferred,
  friendLink,
  friendRequest,
  friendship,
  notification,
  tid,
} from "./fixtures";

function social() {
  const port = createPlainStatePort(createSocialState());
  const calls = {
    loadSocial: vi.fn(async () => ({
      requests: [
        friendRequest("r1", "ana", "me"),
        friendRequest("r2", "me", "ben"),
      ],
      friendships: [friendship("me", "cy")],
      blocks: [block("me", "dee")],
      links: [
        friendLink("l1"),
        friendLink("l2", { uses: 1 }),
        friendLink("l3", { expires_at: "2026-11-14T11:00:00Z" }),
        friendLink("l4", { max_uses: null, uses: 9 }),
      ],
    })),
    sendFriendRequest: vi.fn(
      async (): Promise<ReturnType<typeof friendRequest> | null> =>
        friendRequest("r3", "me", "eve"),
    ),
    answerFriendRequest: vi.fn(async () => {}),
    removeFriend: vi.fn(async () => {}),
    blockUser: vi.fn(async () => {}),
    unblockUser: vi.fn(async () => {}),
    listMyFriendLinks: vi.fn(async () => [friendLink("l9")]),
    createFriendLink: vi.fn(async () => friendLink("l5")),
    revokeFriendLink: vi.fn(async () => {}),
    getFriendLink: vi.fn(async (code: string) => ({
      owner_id: code === "ANAS" ? "ana" : "ben",
      username: code === "ANAS" ? "ana" : "ben",
      avatar_media_id: null,
      already_friends: false,
    })),
    answerFriendLink: vi.fn(async () => {}),
  };
  return { port, calls, social: new Social(port, calls) };
}

describe("friends and blocks", () => {
  it("loads both sides of the requests, the friends and the blocks", async () => {
    const { port, social: s } = social();
    await s.load();
    const state = port.get();
    expect(incomingRequests(state, "me").map((r) => r.id)).toEqual(["r1"]);
    expect(outgoingRequests(state, "me").map((r) => r.id)).toEqual(["r2"]);
    expect(friendIds(state, "me")).toEqual(["cy"]);
    expect(isBlocked(state, "dee")).toBe(true);
  });

  it("shows a sent request, and nothing for one that made a friendship", async () => {
    const { port, calls, social: s } = social();
    await s.sendRequest("eve");
    expect(outgoingRequests(port.get(), "me").map((r) => r.id)).toEqual(["r3"]);
    calls.sendFriendRequest.mockResolvedValueOnce(null);
    await s.sendRequest("ana");
    expect(Object.keys(port.get().friendRequests)).toEqual(["r3"]);
  });

  it("is done with a request once it is answered", async () => {
    const { port, social: s } = social();
    await s.load();
    await s.answerRequest("r1", true);
    expect(incomingRequests(port.get(), "me")).toEqual([]);
    s.applyFriendship(friendship("ana", "me"));
    expect(isFriend(port.get(), "me", "ana")).toBe(true);
  });

  it("ends the friendship and any request with someone blocked", async () => {
    const { port, social: s } = social();
    await s.load();
    s.applyRequest(friendRequest("r4", "cy", "me"));
    await s.block("cy");
    expect(isFriend(port.get(), "me", "cy")).toBe(false);
    expect(incomingRequests(port.get(), "me").map((r) => r.id)).toEqual(["r1"]);
    s.applyBlock(block("me", "cy"));
    expect(isBlocked(port.get(), "cy")).toBe(true);

    // Either side: a request the person sent, a friend whose id sorts after theirs.
    s.applyFriendship(friendship("me", "zoe"));
    await s.block("ben");
    await s.block("zoe");
    expect(outgoingRequests(port.get(), "me")).toEqual([]);
    expect(friendIds(port.get(), "me")).toEqual([]);
  });

  it("follows friendships and blocks that end", async () => {
    const { port, social: s } = social();
    await s.load();
    s.applyFriendshipDeleted(friendship("cy", "me"));
    s.applyBlockDeleted(block("me", "dee"));
    expect(friendIds(port.get(), "me")).toEqual([]);
    expect(isBlocked(port.get(), "dee")).toBe(false);
  });

  it("forgets a removed friend and an unblocked person", async () => {
    const { port, social: s } = social();
    await s.load();
    s.applyFriendship(friendship("me", "zoe"));
    await s.removeFriend("nobody");
    expect(friendIds(port.get(), "me").sort()).toEqual(["cy", "zoe"]);
    await s.removeFriend("cy");
    await s.removeFriend("zoe");
    await s.unblock("dee");
    expect(friendIds(port.get(), "me")).toEqual([]);
    expect(isBlocked(port.get(), "dee")).toBe(false);
  });
});

function notifications(pages: ReturnType<typeof notification>[][] = []) {
  const port = createPlainStatePort(createNotificationsState());
  const calls = {
    listNotifications: vi.fn(async () => pages.shift() ?? []),
    countUnseen: vi.fn(async () => 0),
    markNotifications: vi.fn(async () => 1),
    listPreferences: vi.fn(async () => [
      {
        user_id: "me",
        kind: "mention" as const,
        in_app: true,
        sound: false,
        push: false,
      },
    ]),
    setPreference: vi.fn(async () => {}),
  };
  return {
    port,
    calls,
    notifications: new Notifications(port, calls),
    titles: () => inboxNotifications(port.get()).map((n) => n.title),
  };
}

/** Notifications `from` to `to`, newest first, as the inbox lists them. */
const page = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => notification(to - i));

describe("friend links", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");

  it("offers the person's links that still work, newest first", async () => {
    const { port, social: s } = social();
    await s.load();
    // l2 is used up and l3 expired; l4 has no limit.
    expect(usableLinks(port.get(), now).map((l) => l.id)).toEqual(["l4", "l1"]);
  });

  it("holds a new link, drops a revoked one, and loads them again when told", async () => {
    const { port, calls, social: s } = social();
    await s.load();
    const link = await s.createLink({ max_uses: 3 });
    expect(calls.createFriendLink).toHaveBeenCalledWith({ max_uses: 3 });
    expect(link.code).toBe("CODEL5");
    expect("l5" in port.get().friendLinks).toBe(true);
    await s.revokeLink("l1");
    expect(calls.revokeFriendLink).toHaveBeenCalledWith("l1");
    expect("l1" in port.get().friendLinks).toBe(false);
    await s.loadLinks();
    expect(Object.keys(port.get().friendLinks)).toEqual(["l9"]);
  });

  it("keeps the newest links, not a load that started before they changed", async () => {
    const { port, calls, social: s } = social();
    const before = deferred<ReturnType<typeof friendLink>[]>();
    calls.listMyFriendLinks
      .mockReturnValueOnce(before.promise)
      .mockResolvedValueOnce([friendLink("new")]);
    const first = s.loadLinks();
    // friend_links.changed arrives while the first load is out.
    await s.loadLinks();
    before.resolve([friendLink("old")]);
    await first;
    expect(Object.keys(port.get().friendLinks)).toEqual(["new"]);
  });

  it("opening a link only shows who it is from; answering it is the person's choice", async () => {
    const { port, calls, social: s } = social();
    await s.openLink("ANAS");
    expect(port.get().openedLink?.from.username).toBe("ana");
    expect(calls.answerFriendLink).not.toHaveBeenCalled();
    await s.answerOpenedLink(true);
    expect(calls.answerFriendLink).toHaveBeenCalledWith("ANAS", true);
    expect(port.get().openedLink).toBeNull();

    await s.openLink("BENS");
    await s.answerOpenedLink(false);
    expect(calls.answerFriendLink).toHaveBeenLastCalledWith("BENS", false);
    expect(port.get().openedLink).toBeNull();
  });

  it("puts a link away unanswered, telling nobody, even one still loading", async () => {
    const { port, calls, social: s } = social();
    const slow = deferred<Awaited<ReturnType<typeof calls.getFriendLink>>>();
    calls.getFriendLink.mockReturnValueOnce(slow.promise);
    const opening = s.openLink("ANAS");
    s.closeOpenedLink();
    slow.resolve({
      owner_id: "ana",
      username: "ana",
      avatar_media_id: null,
      already_friends: false,
    });
    await opening;
    expect(port.get().openedLink).toBeNull();
    await s.answerOpenedLink(true);
    expect(calls.answerFriendLink).not.toHaveBeenCalled();
  });

  it("opens nothing from a link that no longer works, and replaces one already open", async () => {
    const { port, calls, social: s } = social();
    await s.openLink("ANAS");
    calls.getFriendLink.mockRejectedValueOnce(
      new HavenError(
        "not_found",
        "link_invalid",
        "That friend link is not valid any more.",
      ),
    );
    await s.openLink("DEAD");
    expect(port.get().openedLink).toBeNull();
    expect(s.requests.status("opened_link").error?.reason).toBe("link_invalid");
  });

  it("keeps a refused answer open, for the screen to say why", async () => {
    const { port, calls, social: s } = social();
    await s.openLink("ANAS");
    calls.answerFriendLink.mockRejectedValueOnce(
      new HavenError(
        "not_found",
        "link_invalid",
        "That friend link is not valid any more.",
      ),
    );
    await expect(s.answerOpenedLink(true)).rejects.toThrow();
    expect(port.get().openedLink?.code).toBe("ANAS");
  });
});

describe("notifications", () => {
  it("loads the newest page and the unseen count", async () => {
    const ctx = notifications([page(1, 2)]);
    ctx.calls.countUnseen.mockResolvedValue(2);
    await ctx.notifications.load();
    expect(ctx.titles()).toEqual(["notification 2", "notification 1"]);
    expect(ctx.port.get().unseen).toBe(2);
    expect(ctx.port.get().inbox?.atOldest).toBe(true);
  });

  it("pages back until the oldest", async () => {
    const ctx = notifications([page(50, 49 + INBOX_PAGE), page(1, 49)]);
    await ctx.notifications.load();
    expect(ctx.port.get().inbox?.atOldest).toBe(false);
    await ctx.notifications.loadOlder();
    expect(ctx.calls.listNotifications).toHaveBeenLastCalledWith({
      before_id: tid(50),
      limit: INBOX_PAGE,
    });
    expect(ctx.titles()).toHaveLength(99);
    expect(ctx.titles()[0]).toBe("notification 99");
    expect(ctx.titles()[98]).toBe("notification 1");
    expect(ctx.port.get().inbox?.atOldest).toBe(true);
  });

  it("puts a new notification first and counts it unseen", async () => {
    const ctx = notifications([page(1, 2)]);
    await ctx.notifications.load();
    ctx.notifications.applyCreated(notification(3));
    ctx.notifications.applyCreated(notification(3));
    expect(ctx.titles()).toEqual([
      "notification 3",
      "notification 2",
      "notification 1",
    ]);
    expect(ctx.port.get().unseen).toBe(1);
  });

  it("leaves out a notification that is not for the inbox", async () => {
    const ctx = notifications([page(1, 1)]);
    await ctx.notifications.load();
    ctx.notifications.applyCreated(notification(2, { in_app: false }));
    expect(ctx.titles()).toEqual(["notification 1"]);
    expect(ctx.port.get().unseen).toBe(0);
  });

  it("does not count one that arrives already seen", async () => {
    const ctx = notifications([page(1, 1)]);
    await ctx.notifications.load();
    ctx.notifications.applyCreated(
      notification(2, { seen_at: "2026-11-14T12:00:00Z" }),
    );
    expect(ctx.port.get().unseen).toBe(0);
  });

  it("loads again after marking, so the inbox is the database's", async () => {
    const ctx = notifications([page(1, 2), page(2, 2)]);
    await ctx.notifications.load();
    await ctx.notifications.mark("dismissed", [tid(1)]);
    expect(ctx.calls.markNotifications).toHaveBeenCalledWith("dismissed", [
      tid(1),
    ]);
    expect(ctx.titles()).toEqual(["notification 2"]);
  });

  it("does not keep the answer of a load that started before the marking", async () => {
    const ctx = notifications();
    const before = deferred<ReturnType<typeof notification>[]>();
    ctx.calls.listNotifications
      .mockReturnValueOnce(before.promise)
      .mockResolvedValueOnce([notification(2)]);
    const loading = ctx.notifications.load();
    await ctx.notifications.mark("dismissed", [tid(1)]);
    before.resolve(page(1, 2));
    await loading;
    expect(ctx.titles()).toEqual(["notification 2"]);
  });

  it("treats a kind never changed as on everywhere", async () => {
    const ctx = notifications();
    await ctx.notifications.loadPreferences();
    expect(preferenceFor(ctx.port.get(), "mention")).toEqual({
      in_app: true,
      sound: false,
      push: false,
    });
    expect(preferenceFor(ctx.port.get(), "direct_message")).toEqual({
      in_app: true,
      sound: true,
      push: true,
    });
    await ctx.notifications.setPreference("direct_message", {
      in_app: true,
      sound: false,
      push: true,
    });
    expect(preferenceFor(ctx.port.get(), "direct_message").sound).toBe(false);
  });
});
