import { describe, expect, it, vi } from "vitest";
import { HavenError } from "@shared/lib/backend/havenError";
import { createPlainStatePort } from "../kit/statePort";
import {
  createMessagesState,
  MAX_WINDOWS,
  Messages,
  type MessagesBackendPart,
  PAGE_SIZE,
} from "../messages/messages";
import {
  latestMessage,
  outgoingMessages,
  windowMessages,
} from "../messages/selectors";
import { deferred, message, newestFirst, tid } from "./fixtures";

function setup(backend: Partial<MessagesBackendPart> = {}) {
  const port = createPlainStatePort(createMessagesState());
  const calls = {
    listMessages: vi.fn(backend.listMessages ?? (async () => [])),
    getMessages: vi.fn(backend.getMessages ?? (async () => [])),
    getLatestMessages: vi.fn(backend.getLatestMessages ?? (async () => [])),
    sendMessage: vi.fn(backend.sendMessage ?? (async () => message(0))),
    editMessage: vi.fn(backend.editMessage ?? (async () => message(0))),
    deleteMessage: vi.fn(backend.deleteMessage ?? (async () => {})),
    setReaction: vi.fn(backend.setReaction ?? (async () => {})),
  };
  let sends = 0;
  const messages = new Messages(port, calls, () => `nonce-${++sends}`);
  const shown = (channelId = "general") =>
    windowMessages(port.get(), channelId).map((m) => m.body);
  const sending = (channelId = "general") =>
    outgoingMessages(port.get(), channelId).map((m) => m.body);
  return { port, calls, messages, shown, sending };
}

/** A channel opened on messages 1..n (a short page, so it reaches the oldest). */
async function opened(n: number) {
  const ctx = setup({ listMessages: async () => newestFirst(1, n) });
  await ctx.messages.open("general");
  ctx.calls.listMessages.mockClear();
  return ctx;
}

describe("opening a channel", () => {
  it("loads its newest page and shows it oldest first", async () => {
    const { messages, shown, port, calls } = await opened(3);
    expect(shown()).toEqual(["message 1", "message 2", "message 3"]);
    expect(messages.window("general")).toMatchObject({
      atOldest: true,
      atNewest: true,
    });
    expect(latestMessage(port.get(), "general")?.id).toBe(tid(3));
    expect(calls.listMessages).not.toHaveBeenCalled();
  });

  it("does not load again while it holds the window", async () => {
    const { messages, calls } = await opened(3);
    await messages.open("general");
    expect(calls.listMessages).not.toHaveBeenCalled();
  });

  it("knows older messages exist when the page is full", async () => {
    const { messages } = setup({
      listMessages: async () => newestFirst(1, PAGE_SIZE),
    });
    await messages.open("general");
    expect(messages.window("general")?.atOldest).toBe(false);
  });

  it("keeps a failed load as the channel's status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { messages } = setup({
      listMessages: () => Promise.reject(new Error("offline")),
    });
    await messages.open("general");
    expect(messages.requests.status("channel:general").error?.message).toBe(
      "offline",
    );
    vi.restoreAllMocks();
  });
});

describe("paging", () => {
  it("adds the page before the oldest message when scrolling up", async () => {
    const { messages, calls, shown } = setup({
      listMessages: async () => newestFirst(PAGE_SIZE + 1, PAGE_SIZE * 2),
    });
    await messages.open("general");
    calls.listMessages.mockImplementation(async () => newestFirst(1, 10));

    await messages.loadOlder("general");
    expect(calls.listMessages).toHaveBeenLastCalledWith("general", {
      before_id: tid(PAGE_SIZE + 1),
      limit: PAGE_SIZE,
    });
    expect(shown().slice(0, 2)).toEqual(["message 1", "message 2"]);
    expect(shown()).toHaveLength(PAGE_SIZE + 10);
    expect(messages.window("general")?.atOldest).toBe(true);
  });

  it("does not ask for older messages once it has the oldest", async () => {
    const { messages, calls } = await opened(3);
    await messages.loadOlder("general");
    expect(calls.listMessages).not.toHaveBeenCalled();
  });

  it("pages forward from a window that is behind, up to the newest", async () => {
    const { messages, port, calls, shown } = await opened(2);
    const window = messages.window("general")!;
    port.set({
      windows: { general: { ...window, atNewest: false } },
    });
    calls.listMessages.mockImplementation(async () => newestFirst(3, 4));

    await messages.loadNewer("general");
    expect(calls.listMessages).toHaveBeenLastCalledWith("general", {
      after_id: tid(2),
      limit: PAGE_SIZE,
    });
    expect(shown()).toEqual([
      "message 1",
      "message 2",
      "message 3",
      "message 4",
    ]);
    expect(messages.window("general")?.atNewest).toBe(true);
    expect(port.get().latest.general).toBe(tid(4));
  });
});

describe("events", () => {
  it("adds a new message to the end of a window that reaches the newest", async () => {
    const { messages, shown, port } = await opened(2);
    messages.applyCreated(message(3));
    expect(shown()).toEqual(["message 1", "message 2", "message 3"]);
    expect(port.get().latest.general).toBe(tid(3));
  });

  it("puts a late-arriving message in time order", async () => {
    const { messages, shown } = await opened(1);
    messages.applyCreated(message(3));
    messages.applyCreated(message(2));
    expect(shown()).toEqual(["message 1", "message 2", "message 3"]);
  });

  it("leaves a window scrolled back in history as it is", async () => {
    const { messages, port, shown } = await opened(2);
    const window = messages.window("general")!;
    port.set({ windows: { general: { ...window, atNewest: false } } });

    messages.applyCreated(message(9));
    expect(shown()).toEqual(["message 1", "message 2"]);
    expect(latestMessage(port.get(), "general")?.id).toBe(tid(9));
  });

  it("keeps the newest message of a channel nobody has opened", () => {
    const { messages, port } = setup();
    messages.applyCreated(message(1, { channel_id: "random" }));
    messages.applyCreated(message(3, { channel_id: "random" }));
    // A message that arrives late is not the newest.
    messages.applyCreated(message(2, { channel_id: "random" }));
    expect(latestMessage(port.get(), "random")?.id).toBe(tid(3));
    expect(Object.keys(port.get().byId)).toEqual([tid(3)]);
  });

  it("replaces a message it holds and ignores one it does not", async () => {
    const { messages, shown, port } = await opened(1);
    messages.applyUpdated(message(1, { body: "edited" }));
    messages.applyUpdated(message(7, { body: "never loaded" }));
    expect(shown()).toEqual(["edited"]);
    expect(port.get().byId[tid(7)]).toBeUndefined();
  });

  it("removes a deleted message everywhere", async () => {
    const { messages, shown, port } = await opened(3);
    messages.applyDeleted(tid(2), "general");
    expect(shown()).toEqual(["message 1", "message 3"]);
    expect(port.get().byId[tid(2)]).toBeUndefined();
  });

  it("falls back to the message before when the newest is deleted", async () => {
    const { messages, port, calls } = await opened(3);
    messages.applyDeleted(tid(3), "general");
    expect(port.get().latest.general).toBe(tid(2));
    expect(calls.getLatestMessages).not.toHaveBeenCalled();
  });

  it("asks again for a channel's newest when the one it knew is deleted", async () => {
    const { messages, port, calls } = setup({
      getLatestMessages: async () => [message(1, { channel_id: "random" })],
    });
    messages.applyCreated(message(2, { channel_id: "random" }));

    messages.applyDeleted(tid(2), "random");
    await vi.waitFor(() => expect(port.get().latest.random).toBe(tid(1)));
    expect(calls.getLatestMessages).toHaveBeenCalledWith(["random"]);
  });
});

describe("a ban", () => {
  const banned = { author_id: "spammer" };

  it("marks their messages hidden for someone who may see hidden ones", async () => {
    const { messages, port } = setup({
      listMessages: async () => [message(2, banned), message(1)],
    });
    await messages.open("general");
    messages.applyBanned("hearth", "spammer", true);
    expect(port.get().byId[tid(2)]?.hidden).toBe(true);
    expect(port.get().byId[tid(1)]?.hidden).toBe(false);
  });

  it("removes their messages for everyone else", async () => {
    const { messages, shown, port, calls } = setup({
      listMessages: async () => [message(2, banned), message(1)],
    });
    await messages.open("general");
    calls.getLatestMessages.mockResolvedValue([message(1)]);

    messages.applyBanned("hearth", "spammer", false);
    expect(shown()).toEqual(["message 1"]);
    expect(port.get().byId[tid(2)]).toBeUndefined();
    await vi.waitFor(() => expect(port.get().latest.general).toBe(tid(1)));
  });

  it("leaves their messages in other communities alone", async () => {
    const { messages, port } = setup();
    messages.applyCreated(message(1, { ...banned, community_id: "other" }));
    messages.applyBanned("hearth", "spammer", false);
    expect(port.get().byId[tid(1)]).toBeDefined();
  });
});

describe("letting go", () => {
  it("drops a channel's messages, and a load still running writes nothing", async () => {
    const page = deferred<ReturnType<typeof newestFirst>>();
    const { messages, port } = setup({ listMessages: () => page.promise });
    messages.applyCreated(message(1));
    const loading = messages.open("general");

    messages.dropChannel("general");
    page.resolve(newestFirst(1, 3));
    await loading;
    expect(port.get().windows.general).toBeUndefined();
    expect(port.get().byId).toEqual({});
    expect(port.get().latest).toEqual({});
  });

  it("closes the window opened longest ago, keeping its newest message", async () => {
    let made = 0;
    const { messages, port } = setup({
      listMessages: async (channelId) => [
        message((made += 1), { channel_id: channelId }),
      ],
    });
    for (let n = 0; n <= MAX_WINDOWS; n += 1) {
      await messages.open(`channel-${n}`);
    }
    expect(Object.keys(port.get().windows)).toHaveLength(MAX_WINDOWS);
    expect(port.get().windows["channel-0"]).toBeUndefined();
    expect(latestMessage(port.get(), "channel-0")).not.toBeNull();
  });

  it("keeps a window that was looked at again", async () => {
    const { messages, port } = setup({
      listMessages: async (channelId) => [
        message(1, { channel_id: channelId }),
      ],
    });
    await messages.open("channel-0");
    for (let n = 1; n < MAX_WINDOWS; n += 1) {
      await messages.open(`channel-${n}`);
    }
    await messages.open("channel-0");
    await messages.open("one-more");
    expect(port.get().windows["channel-0"]).toBeDefined();
    expect(port.get().windows["channel-1"]).toBeUndefined();
  });

  it("takes the newest page as the truth after being away", async () => {
    const { messages, port, calls, shown } = await opened(3);
    // Message 3 was deleted while the app was offline.
    calls.listMessages.mockResolvedValue(newestFirst(1, 2));
    await messages.loadNewest("general");
    expect(shown()).toEqual(["message 1", "message 2"]);
    expect(port.get().latest.general).toBe(tid(2));
    expect(port.get().byId[tid(3)]).toBeUndefined();
  });

  it("starts empty after clear", async () => {
    const { messages, port } = await opened(3);
    messages.clear();
    expect(port.get()).toEqual(createMessagesState());
  });
});

describe("sending", () => {
  /** The stored message for the n-th send of this test. */
  const stored = (n: number, sendNumber = 1) =>
    message(n, { author_id: "me", nonce: `nonce-${sendNumber}` });

  it("shows the message at once, then the stored one in its place", async () => {
    const { messages, calls, shown, sending } = await opened(1);
    const answer = deferred<ReturnType<typeof message>>();
    calls.sendMessage.mockReturnValue(answer.promise);
    const sent = messages.send("general", { body: "message 2" });
    expect(sending()).toEqual(["message 2"]);
    expect(calls.sendMessage).toHaveBeenCalledWith("general", {
      body: "message 2",
      nonce: "nonce-1",
    });

    answer.resolve(stored(2));
    await sent;
    expect(sending()).toEqual([]);
    expect(shown()).toEqual(["message 1", "message 2"]);
  });

  it("swaps in the stored message when its event comes before the answer", async () => {
    const { messages, calls, shown, sending } = await opened(1);
    const answer = deferred<ReturnType<typeof message>>();
    calls.sendMessage.mockReturnValue(answer.promise);
    const sent = messages.send("general", { body: "message 2" });

    messages.applyCreated(stored(2));
    expect(sending()).toEqual([]);
    answer.resolve(stored(2));
    await sent;
    expect(shown()).toEqual(["message 1", "message 2"]);
  });

  it("keeps a refused message with its error, and retries it under the same nonce", async () => {
    const { messages, calls, shown, sending, port } = await opened(1);
    calls.sendMessage.mockRejectedValueOnce(
      new HavenError("rate_limited", "rate_limited", "Too fast."),
    );
    await expect(
      messages.send("general", { body: "message 2" }),
    ).rejects.toMatchObject({ reason: "rate_limited" });
    expect(sending()).toEqual(["message 2"]);
    expect(port.get().outgoing["nonce-1"]?.error?.reason).toBe("rate_limited");

    calls.sendMessage.mockResolvedValueOnce(stored(2));
    await messages.retry("nonce-1");
    expect(calls.sendMessage).toHaveBeenLastCalledWith("general", {
      body: "message 2",
      nonce: "nonce-1",
    });
    expect(sending()).toEqual([]);
    expect(shown()).toEqual(["message 1", "message 2"]);
  });

  it("shows a retried message as on its way again", async () => {
    const { messages, calls, port } = await opened(1);
    calls.sendMessage.mockRejectedValueOnce(new Error("offline"));
    await expect(messages.send("general", { body: "hi" })).rejects.toThrow();
    calls.sendMessage.mockReturnValueOnce(new Promise(() => {}));
    void messages.retry("nonce-1");
    expect(port.get().outgoing["nonce-1"]?.error).toBeNull();
  });

  it("lets go of a refused message on discard", async () => {
    const { messages, calls, sending } = await opened(1);
    calls.sendMessage.mockRejectedValueOnce(new Error("offline"));
    await expect(messages.send("general", { body: "hi" })).rejects.toThrow();
    messages.discard("nonce-1");
    expect(sending()).toEqual([]);
    await expect(messages.retry("nonce-1")).rejects.toMatchObject({
      reason: "not_outgoing",
    });
  });

  it("counts a send as made when its event came and the answer was lost", async () => {
    const { messages, calls, port } = await opened(1);
    const answer = deferred<ReturnType<typeof message>>();
    calls.sendMessage.mockReturnValue(answer.promise);
    const sent = messages.send("general", { body: "message 2" });
    messages.applyCreated(stored(2));
    answer.reject(new Error("connection dropped"));
    await expect(sent).resolves.toMatchObject({ id: tid(2) });
    expect(port.get().outgoing).toEqual({});
  });

  it("does so even where the message is not held (a window scrolled back)", async () => {
    const { messages, calls, port } = await opened(1);
    port.set({
      windows: { general: { ...messages.window("general")!, atNewest: false } },
      latest: { general: tid(9) },
    });
    const answer = deferred<ReturnType<typeof message>>();
    calls.sendMessage.mockReturnValue(answer.promise);
    const sent = messages.send("general", { body: "message 2" });
    messages.applyCreated(stored(2));
    answer.reject(new Error("connection dropped"));
    await expect(sent).resolves.toMatchObject({ id: tid(2) });
    expect(messages.get(tid(2))).toBeUndefined();
  });

  it("settles a message found on a page, when both its event and answer were lost", async () => {
    const { messages, calls, sending } = await opened(1);
    calls.sendMessage.mockRejectedValueOnce(new Error("connection dropped"));
    await expect(
      messages.send("general", { body: "message 2" }),
    ).rejects.toThrow();
    calls.listMessages.mockResolvedValue([stored(2), message(1)]);
    await messages.loadNewest("general");
    expect(sending()).toEqual([]);
  });

  it("shows each channel only its own outgoing messages, in the order sent", async () => {
    const { messages, calls, sending } = await opened(1);
    calls.sendMessage.mockReturnValue(new Promise(() => {}));
    void messages.send("general", { body: "first" });
    void messages.send("elsewhere", { body: "other" });
    void messages.send("general", { body: "second" });
    expect(sending()).toEqual(["first", "second"]);
    expect(sending("elsewhere")).toEqual(["other"]);

    messages.dropChannel("general");
    expect(sending()).toEqual([]);
    expect(sending("elsewhere")).toEqual(["other"]);
  });
});

describe("commands", () => {
  it("removes a message once the database deleted it", async () => {
    const { messages, calls, shown } = await opened(2);
    await messages.remove(tid(2));
    expect(calls.deleteMessage).toHaveBeenCalledWith(tid(2));
    expect(shown()).toEqual(["message 1"]);
  });

  it("keeps a message the database refused to delete", async () => {
    const { messages, calls, shown } = await opened(2);
    calls.deleteMessage.mockRejectedValue(new Error("not yours"));
    await expect(messages.remove(tid(2))).rejects.toThrow("not yours");
    expect(shown()).toEqual(["message 1", "message 2"]);
  });

  it("shows an edit from the database's reply", async () => {
    const { messages, calls, shown } = await opened(1);
    calls.editMessage.mockResolvedValue(message(1, { body: "edited" }));
    await messages.edit(tid(1), "edited");
    expect(shown()).toEqual(["edited"]);
  });

  it("fetches only the messages it does not hold", async () => {
    const { messages, calls } = await opened(1);
    await messages.ensure([tid(1), tid(9)]);
    expect(calls.getMessages).toHaveBeenCalledWith([tid(9)]);
  });
});
