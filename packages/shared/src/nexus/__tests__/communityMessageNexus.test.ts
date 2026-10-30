import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import type { MessageBundle } from "@shared/lib/backend/types";
import { createPlainStatePort } from "../kit/statePort";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
} from "../messages/communityMessageNexus";
import { selectChannelMessages } from "../messages/communityMessageSelectors";

const BASE = Date.UTC(2026, 0, 1);

const bundle = (
  id: string,
  second: number,
  overrides: Partial<MessageBundle> = {},
): MessageBundle => ({
  id,
  channelId: "c1",
  authorUserId: "u1",
  displayName: "alice",
  avatarSnapshotUrl: null,
  content: `body ${id}`,
  metadata: {},
  replyToMessageId: null,
  createdAt: new Date(BASE + second * 1000).toISOString(),
  editedAt: null,
  deletedAt: null,
  isHidden: false,
  isPlatformStaff: false,
  reactions: [],
  attachment: null,
  linkPreview: null,
  ...overrides,
});

function setup() {
  const port = createPlainStatePort(createInitialCommunityMessageState());
  const nexus = new CommunityMessageNexus(
    "s1",
    port,
    createMemoryPersistence(),
  );
  const order = () => selectChannelMessages(port.get(), "c1").map((m) => m.id);
  return { nexus, port, order };
}

describe("CommunityMessageNexus write semantics", () => {
  it("insertMessage keeps an already-cached message (a realtime echo must not clobber the optimistic copy)", () => {
    const { nexus } = setup();
    nexus.insertMessage(
      bundle("m1", 1, { content: "optimistic", attachment: null }),
    );

    nexus.insertMessage(bundle("m1", 1, { content: "thin realtime echo" }));

    expect(nexus.getSnapshot("m1")?.content).toBe("optimistic");
  });

  it("upsertMessage replaces the message and moves it to its authoritative slot", () => {
    const { nexus, order } = setup();
    nexus.insertMessages(
      [bundle("a", 1), bundle("b", 2), bundle("c", 3)],
      "c1",
      { hasMore: false, cursor: null },
    );

    // The server says "a" was really created last.
    nexus.upsertMessage(bundle("a", 9, { content: "server copy" }));

    expect(order()).toEqual(["b", "c", "a"]);
    expect(nexus.getSnapshot("a")?.content).toBe("server copy");
  });

  it("insertMessages lets fetched data win over the cache", () => {
    const { nexus } = setup();
    nexus.insertMessage(bundle("m1", 1, { content: "stale" }));

    nexus.insertMessages([bundle("m1", 1, { content: "fresh" })], "c1", {
      hasMore: false,
      cursor: null,
    });

    expect(nexus.getSnapshot("m1")?.content).toBe("fresh");
  });
});

describe("CommunityMessageNexus.send", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never stamps an optimistic message earlier than the newest one (lagging clock)", async () => {
    const { nexus, order } = setup();
    nexus.setCommunityData({
      sendUserMessage: vi.fn(async () => ({ id: "mine" })),
    } as never);
    nexus.insertMessages([bundle("latest", 100)], "c1", {
      hasMore: false,
      cursor: null,
    });
    // This device's clock reads earlier than the newest message's timestamp.
    vi.setSystemTime(BASE + 50 * 1000);

    await nexus.send("c1", "hello");

    expect(order()).toEqual(["latest", "mine"]);
  });
});

describe("CommunityMessageNexus loading", () => {
  it("shares one in-flight initial load per channel", async () => {
    const { nexus } = setup();
    const listChannelMessages = vi.fn(async () => ({
      messages: [bundle("m1", 1)],
      hasMore: false,
    }));
    nexus.setCommunityData({ listChannelMessages } as never);

    await Promise.all([nexus.loadInitial("c1"), nexus.loadInitial("c1")]);

    expect(listChannelMessages).toHaveBeenCalledTimes(1);
  });

  it("clears the loading flag even when the fetch fails", async () => {
    const { nexus, port } = setup();
    nexus.setCommunityData({
      listChannelMessages: vi.fn(async () => {
        throw new Error("offline");
      }),
    } as never);

    await expect(nexus.loadInitial("c1")).rejects.toThrow("offline");

    expect(port.get().loadingInitial.c1).toBe(false);
  });

  it("starts from fresh state objects, never shared constants", () => {
    const a = createInitialCommunityMessageState();
    const b = createInitialCommunityMessageState();
    expect(a.entities).not.toBe(b.entities);
    expect(a.byChannel).not.toBe(b.byChannel);
  });
});

describe("CommunityMessageNexus edit and delete", () => {
  /** A backend call that waits until the test settles it. */
  function pending() {
    let settle!: (error?: Error) => void;
    const call = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = (error) => (error ? reject(error) : resolve());
        }),
    );
    return { call, settle: (error?: Error) => settle(error) };
  }

  it("edit shows the new text while the request is in flight", async () => {
    const { nexus } = setup();
    nexus.insertMessage(bundle("m1", 1, { content: "before" }));
    const backend = pending();
    nexus.setCommunityData({ editUserMessage: backend.call } as never);

    const editing = nexus.edit("m1", "  after  ");
    expect(nexus.getSnapshot("m1")).toMatchObject({ content: "after" });
    expect(nexus.getSnapshot("m1")?.editedAt).not.toBeNull();

    backend.settle();
    await editing;
    expect(backend.call).toHaveBeenCalledWith({
      communityId: "s1",
      messageId: "m1",
      content: "after",
    });
  });

  it("a refused edit puts the old text back and rethrows", async () => {
    const { nexus } = setup();
    nexus.insertMessage(bundle("m1", 1, { content: "before" }));
    const backend = pending();
    nexus.setCommunityData({ editUserMessage: backend.call } as never);

    const editing = nexus.edit("m1", "after");
    backend.settle(new Error("refused"));

    await expect(editing).rejects.toThrow("refused");
    expect(nexus.getSnapshot("m1")).toMatchObject({
      content: "before",
      editedAt: null,
    });
  });

  it("edit refuses empty text and skips an unchanged one", async () => {
    const { nexus } = setup();
    nexus.insertMessage(bundle("m1", 1, { content: "same" }));
    const editUserMessage = vi.fn(async () => undefined);
    nexus.setCommunityData({ editUserMessage } as never);

    await expect(nexus.edit("m1", "   ")).rejects.toThrow("empty");
    await nexus.edit("m1", "same");
    expect(editUserMessage).not.toHaveBeenCalled();
  });

  it("delete removes the message while the request is in flight", async () => {
    const { nexus, order } = setup();
    nexus.insertMessage(bundle("m1", 1));
    nexus.insertMessage(bundle("m2", 2));
    const backend = pending();
    nexus.setCommunityData({ deleteMessage: backend.call } as never);

    const deleting = nexus.deleteMessage("m1");
    expect(order()).toEqual(["m2"]);

    backend.settle();
    await deleting;
    expect(order()).toEqual(["m2"]);
    expect(backend.call).toHaveBeenCalledWith({
      communityId: "s1",
      messageId: "m1",
    });
  });

  it("a refused delete puts the message back in its place and rethrows", async () => {
    const { nexus, order } = setup();
    nexus.insertMessage(bundle("m1", 1));
    nexus.insertMessage(bundle("m2", 2));
    const backend = pending();
    nexus.setCommunityData({ deleteMessage: backend.call } as never);

    const deleting = nexus.deleteMessage("m1");
    backend.settle(new Error("refused"));

    await expect(deleting).rejects.toThrow("refused");
    expect(order()).toEqual(["m1", "m2"]);
    expect(nexus.getSnapshot("m1")?.content).toBe("body m1");
  });
});
