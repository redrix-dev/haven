import { describe, expect, it, vi } from "vitest";
import {
  Channels,
  type ChannelsBackendPart,
  channelsCopy,
  createChannelsState,
  UNREAD_CAP,
} from "../channels/channels";
import {
  communityChannels,
  conversations,
  isMuted,
  otherPerson,
  unreadCount,
} from "../channels/selectors";
import { createPlainStatePort } from "../kit/statePort";
import { channel, message, tid } from "./fixtures";

function setup(backend: Partial<ChannelsBackendPart> = {}) {
  const port = createPlainStatePort(createChannelsState());
  const calls = {
    listCommunityChannels: vi.fn(
      backend.listCommunityChannels ?? (async () => []),
    ),
    listConversations: vi.fn(
      backend.listConversations ??
        (async () => ({ channels: [], participants: [] })),
    ),
    listMyChannelState: vi.fn(backend.listMyChannelState ?? (async () => [])),
    getUnreadCounts: vi.fn(backend.getUnreadCounts ?? (async () => [])),
    markRead: vi.fn(backend.markRead ?? (async () => {})),
    muteChannel: vi.fn(backend.muteChannel ?? (async () => {})),
    createChannel: vi.fn(
      backend.createChannel ??
        (async (communityId: string, kind: "text" | "voice", name: string) =>
          channel("made", { community_id: communityId, kind, name })),
    ),
    updateChannel: vi.fn(
      backend.updateChannel ??
        (async (id: string, changes: { name?: string; topic?: string }) =>
          channel(id, {
            name: changes.name ?? id,
            topic: changes.topic ?? null,
          })),
    ),
    moveChannel: vi.fn(
      backend.moveChannel ??
        (async (id: string, categoryId: string | null, position: number) =>
          channel(id, { category_id: categoryId, position })),
    ),
    deleteChannel: vi.fn(backend.deleteChannel ?? (async () => {})),
  };
  return { port, calls, channels: new Channels(port, calls) };
}

/** A channel whose newest message is `latest`, read up to `read`. */
function withChannel(latest: number | null, read: number | null) {
  const ctx = setup();
  ctx.channels.applyChannel(
    channel("general", { latest_message_id: latest ? tid(latest) : null }),
  );
  if (read) {
    ctx.port.set({
      mine: {
        general: {
          channel_id: "general",
          last_read_message_id: tid(read),
          muted_until: null,
        },
      },
    });
  }
  return ctx;
}

describe("loading", () => {
  it("replaces one community's channels and leaves the others", async () => {
    const { channels, port, calls } = setup();
    calls.listCommunityChannels.mockResolvedValue([
      channel("general"),
      channel("gone"),
    ]);
    await channels.loadCommunity("hearth");
    channels.applyChannel(channel("elsewhere", { community_id: "other" }));

    calls.listCommunityChannels.mockResolvedValue([channel("general")]);
    await channels.loadCommunity("hearth");
    expect(Object.keys(port.get().byId).sort()).toEqual([
      "elsewhere",
      "general",
    ]);
  });

  it("loads conversations with the people in them", async () => {
    const { channels, port, calls } = setup();
    const dm = channel("dm-1", { kind: "dm", community_id: null });
    calls.listConversations.mockResolvedValue({
      channels: [dm],
      participants: [
        { channel_id: "dm-1", user_id: "me", joined_at: "" },
        { channel_id: "dm-1", user_id: "ana", joined_at: "" },
      ],
    });
    await channels.loadConversations();
    expect(otherPerson(port.get(), "dm-1", "me")).toBe("ana");
    expect(conversations(port.get()).map((c) => c.id)).toEqual(["dm-1"]);

    // The conversation is gone from the next answer (the friendship ended).
    calls.listConversations.mockResolvedValue({
      channels: [],
      participants: [],
    });
    await channels.loadConversations();
    expect(port.get().byId["dm-1"]).toBeUndefined();
    expect(otherPerson(port.get(), "dm-1", "me")).toBeNull();
  });

  it("writes nothing from a load that ends after its community is gone", async () => {
    let answer!: (channels: ReturnType<typeof channel>[]) => void;
    const { channels, port, calls } = setup();
    calls.listCommunityChannels.mockReturnValue(
      new Promise((resolve) => (answer = resolve)),
    );
    const loading = channels.loadCommunity("hearth");

    channels.applyCommunityGone("hearth");
    answer([channel("general")]);
    await loading;
    expect(port.get().byId).toEqual({});
  });

  it("loads read marks, mutes and unread counts together", async () => {
    const { channels, port } = setup({
      listMyChannelState: async () => [
        {
          channel_id: "general",
          user_id: "me",
          last_read_message_id: tid(1),
          muted_until: "2999-01-01T00:00:00Z",
        },
      ],
      getUnreadCounts: async () => [{ channel_id: "general", unread: 4 }],
    });
    await channels.loadMine();
    expect(unreadCount(port.get(), "general")).toBe(4);
    expect(isMuted(port.get(), "general")).toBe(true);
    expect(port.get().mine.general).toEqual({
      channel_id: "general",
      last_read_message_id: tid(1),
      muted_until: "2999-01-01T00:00:00Z",
    });
  });
});

describe("reading", () => {
  it("clears the badge at once and tells the database", async () => {
    const { channels, port, calls } = withChannel(5, 1);
    port.set({ unread: { general: 4 } });
    await channels.markRead("general", tid(5));
    expect(unreadCount(port.get(), "general")).toBe(0);
    expect(calls.markRead).toHaveBeenCalledWith("general", tid(5));
  });

  it("never moves a read mark back", async () => {
    const { channels, port, calls } = withChannel(5, 4);
    await channels.markRead("general", tid(2));
    expect(calls.markRead).not.toHaveBeenCalled();
    expect(port.get().mine.general?.last_read_message_id).toBe(tid(4));
  });

  it("ignores a read from another device that is behind this one", () => {
    const { channels, port, calls } = withChannel(5, 4);
    port.set({ unread: { general: 1 } });
    channels.applyRead("general", tid(2));
    expect(unreadCount(port.get(), "general")).toBe(1);
    expect(calls.getUnreadCounts).not.toHaveBeenCalled();
  });

  it("asks the database how many are left after reading part of the way", async () => {
    const { channels, port, calls } = withChannel(5, 1);
    port.set({ unread: { general: 4 } });
    calls.getUnreadCounts.mockResolvedValue([
      { channel_id: "general", unread: 2 },
    ]);
    channels.applyRead("general", tid(3));
    await vi.waitFor(() => expect(unreadCount(port.get(), "general")).toBe(2));
  });
});

describe("new messages", () => {
  it("moves the channel's newest id forward, and never back", () => {
    const { channels } = withChannel(3, 3);
    channels.applyMessageCreated(message(5), "me");
    channels.applyMessageCreated(message(4), "me");
    expect(channels.get("general")?.latest_message_id).toBe(tid(5));
  });

  it("counts someone else's message as unread, up to the cap", () => {
    const { channels, port } = withChannel(1, 1);
    channels.applyMessageCreated(message(2), "me");
    expect(unreadCount(port.get(), "general")).toBe(1);

    port.set({ unread: { general: UNREAD_CAP } });
    channels.applyMessageCreated(message(3), "me");
    expect(unreadCount(port.get(), "general")).toBe(UNREAD_CAP);
  });

  it("counts the person's own message as read, as the database does", () => {
    const { channels, port } = withChannel(1, 1);
    port.set({ unread: { general: 3 } });
    channels.applyMessageCreated(message(2, { author_id: "me" }), "me");
    expect(unreadCount(port.get(), "general")).toBe(0);
    expect(port.get().mine.general?.last_read_message_id).toBe(tid(2));
  });

  it("does not count a message older than the read mark", () => {
    const { channels, port } = withChannel(5, 5);
    channels.applyMessageCreated(message(4), "me");
    expect(unreadCount(port.get(), "general")).toBe(0);
  });

  it("takes a deleted unread message off the count", () => {
    const { channels, port } = withChannel(5, 3);
    port.set({ unread: { general: 2 } });
    channels.applyMessageDeleted(tid(2), "general");
    expect(unreadCount(port.get(), "general")).toBe(2);
    channels.applyMessageDeleted(tid(4), "general");
    expect(unreadCount(port.get(), "general")).toBe(1);
  });
});

describe("channel events", () => {
  it("loads the people of a new conversation", async () => {
    const { channels, calls } = setup();
    channels.applyChannel(channel("dm-1", { kind: "dm", community_id: null }));
    await vi.waitFor(() =>
      expect(calls.listConversations).toHaveBeenCalledOnce(),
    );
  });

  it("forgets everything about a deleted channel", () => {
    const { channels, port } = withChannel(5, 3);
    port.set({ unread: { general: 2 } });
    channels.applyChannelDeleted("general");
    expect(port.get().byId.general).toBeUndefined();
    expect(port.get().mine.general).toBeUndefined();
    expect(port.get().unread.general).toBeUndefined();
  });

  it("forgets a community's channels when the community is gone", () => {
    const { channels, port } = setup();
    channels.applyChannel(channel("general"));
    channels.applyChannel(channel("elsewhere", { community_id: "other" }));
    channels.applyCommunityGone("hearth");
    expect(Object.keys(port.get().byId)).toEqual(["elsewhere"]);
  });
});

describe("views", () => {
  it("orders a community's channels by position, then id", () => {
    const { channels, port } = setup();
    channels.applyChannel(channel("b", { position: 1 }));
    channels.applyChannel(channel("c", { position: 0 }));
    channels.applyChannel(channel("a", { position: 1 }));
    expect(communityChannels(port.get(), "hearth").map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("puts the most recently active conversation first, unused ones last", () => {
    const { channels, port } = setup();
    const dm = { kind: "dm" as const, community_id: null };
    channels.applyChannel(channel("quiet", dm));
    channels.applyChannel(channel("general", { latest_message_id: tid(3) }));
    channels.applyChannel(channel("old", { ...dm, latest_message_id: tid(1) }));
    channels.applyChannel(channel("new", { ...dm, latest_message_id: tid(2) }));
    expect(conversations(port.get()).map((c) => c.id)).toEqual([
      "new",
      "old",
      "quiet",
    ]);
  });
});

describe("the device copy", () => {
  it("keeps community channels and never conversations", () => {
    const state = createChannelsState();
    state.byId = {
      general: channel("general"),
      "dm-1": channel("dm-1", { kind: "dm", community_id: null }),
    };
    const saved = JSON.parse(JSON.stringify(channelsCopy.pick(state)));
    expect(Object.keys(channelsCopy.restore(saved).byId ?? {})).toEqual([
      "general",
    ]);
  });
});

describe("managing channels", () => {
  it("shows a new, renamed or moved channel from the database's answer", async () => {
    const { port, channels } = setup();
    await channels.create("hearth", "voice", "Lounge");
    expect(port.get().byId.made).toMatchObject({
      kind: "voice",
      name: "Lounge",
    });
    await channels.update("made", { name: "Den", topic: "quiet" });
    expect(port.get().byId.made).toMatchObject({ name: "Den", topic: "quiet" });
    await channels.move("made", "cat", 3);
    expect(port.get().byId.made).toMatchObject({
      category_id: "cat",
      position: 3,
    });
  });

  it("forgets a deleted channel, and keeps one the database refused to delete", async () => {
    const { port, calls, channels } = setup();
    channels.applyChannel(channel("general"));
    calls.deleteChannel.mockRejectedValueOnce(new Error("forbidden"));
    await expect(channels.remove("general")).rejects.toThrow();
    expect(port.get().byId.general).toBeDefined();
    await channels.remove("general");
    expect(port.get().byId.general).toBeUndefined();
  });
});
