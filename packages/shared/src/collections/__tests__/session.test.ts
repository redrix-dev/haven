// Session: where the person is and what they have not sent, kept on the device.
import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import { DeviceCopies, deviceKey } from "../kit/deviceCopies";
import { createPlainStatePort } from "../kit/statePort";
import { draftFor, openChannelId, openCommunityId } from "../session/selectors";
import {
  createSessionState,
  DRAFT_LIMIT,
  Session,
  sessionCopy,
} from "../session/session";

function setup() {
  const port = createPlainStatePort(createSessionState());
  return { port, session: new Session(port) };
}

describe("where the person is", () => {
  it("opens a community where it was left", () => {
    const { port, session } = setup();
    session.openCommunity("hearth");
    expect(openCommunityId(port.get())).toBe("hearth");
    expect(openChannelId(port.get())).toBeNull();
    session.openChannel("hearth", "general");
    session.openConversation("dm1");
    expect(openChannelId(port.get())).toBe("dm1");
    expect(openCommunityId(port.get())).toBeNull();
    session.openCommunity("hearth");
    expect(openChannelId(port.get())).toBe("general");
    session.openCommunity("other");
    expect(openChannelId(port.get())).toBeNull();
    session.goHome();
    expect(port.get().place).toBeNull();
  });
});

describe("drafts", () => {
  it("keeps what was typed per channel, and an empty box is no draft", () => {
    const { port, session } = setup();
    session.setDraft("general", { body: "half a thought", reply_to_id: null });
    session.setDraft("random", { body: "", reply_to_id: "m1" });
    expect(draftFor(port.get(), "general").body).toBe("half a thought");
    expect(draftFor(port.get(), "random").reply_to_id).toBe("m1");
    session.setDraft("general", { body: "", reply_to_id: null });
    expect(Object.keys(port.get().drafts)).toEqual(["random"]);
    session.clearDraft("random");
    expect(port.get().drafts).toEqual({});
    expect(draftFor(port.get(), "nowhere")).toEqual({
      body: "",
      reply_to_id: null,
    });
  });

  it("cuts a draft to what the database would take", () => {
    const { port, session } = setup();
    session.setDraft("general", {
      body: "x".repeat(DRAFT_LIMIT + 10),
      reply_to_id: null,
    });
    expect(draftFor(port.get(), "general").body).toHaveLength(DRAFT_LIMIT);
  });
});

describe("what the person can no longer see", () => {
  it("leaving a community drops its place, its last channel and its drafts", () => {
    const { port, session } = setup();
    session.openChannel("hearth", "general");
    session.openChannel("other", "lobby");
    session.openChannel("hearth", "general");
    session.setDraft("general", { body: "a", reply_to_id: null });
    session.setDraft("lobby", { body: "b", reply_to_id: null });
    session.forgetCommunity("hearth", ["general", "random"]);
    const state = port.get();
    expect(state.place).toBeNull();
    expect(state.lastChannel).toEqual({ other: "lobby" });
    expect(Object.keys(state.drafts)).toEqual(["lobby"]);
  });

  it("leaving another community keeps the person where they are", () => {
    const { port, session } = setup();
    session.openChannel("other", "lobby");
    session.openChannel("hearth", "general");
    session.forgetCommunity("other", ["lobby"]);
    expect(openChannelId(port.get())).toBe("general");
  });

  it("a channel that goes leaves the person in its community, and is not reopened", () => {
    const { port, session } = setup();
    session.openChannel("hearth", "general");
    session.setDraft("general", { body: "a", reply_to_id: null });
    session.forgetChannel("general");
    expect(port.get().place).toEqual({
      kind: "community",
      community_id: "hearth",
      channel_id: null,
    });
    expect(port.get().lastChannel).toEqual({});
    expect(port.get().drafts).toEqual({});
    session.openCommunity("hearth");
    expect(openChannelId(port.get())).toBeNull();
  });

  it("a conversation that goes leaves the person at home", () => {
    const { port, session } = setup();
    session.openConversation("dm1");
    session.forgetChannel("dm1");
    expect(port.get().place).toBeNull();
  });

  it("another channel going changes nothing", () => {
    const { port, session } = setup();
    session.openChannel("hearth", "general");
    const before = port.get();
    session.forgetChannel("random");
    expect(port.get()).toEqual(before);
  });
});

describe("the device copy", () => {
  it("puts the person back where they were, with their drafts", () => {
    const storage = createMemoryPersistence();
    const first = new DeviceCopies(storage, () => () => {});
    const firstPort = first.track(
      sessionCopy,
      createPlainStatePort(createSessionState()),
    );
    first.open("me");
    const session = new Session(firstPort);
    session.openChannel("hearth", "general");
    session.setDraft("general", { body: "unsent", reply_to_id: "m1" });
    first.flush();

    const second = new DeviceCopies(storage, () => () => {});
    const inner = createPlainStatePort(createSessionState());
    second.track(sessionCopy, inner);
    second.open("me");
    expect(openChannelId(inner.get())).toBe("general");
    expect(draftFor(inner.get(), "general")).toEqual({
      body: "unsent",
      reply_to_id: "m1",
    });
  });

  it("drops a copy that is not the right shape", () => {
    const storage = createMemoryPersistence();
    storage.set(
      deviceKey("me", "session", 1),
      JSON.stringify({
        place: { kind: "elsewhere" },
        lastChannel: {},
        drafts: {},
      }),
    );
    const copies = new DeviceCopies(storage, () => () => {});
    const inner = createPlainStatePort(createSessionState());
    copies.track(sessionCopy, inner);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    copies.open("me");
    vi.restoreAllMocks();
    expect(inner.get()).toEqual(createSessionState());
    expect(storage.getString(deviceKey("me", "session", 1))).toBeNull();
  });

  it.each([
    ["a draft without a body", { drafts: { c: { reply_to_id: null } } }],
    [
      "a draft replying to nothing",
      { drafts: { c: { body: "x", reply_to_id: "" } } },
    ],
    ["a last channel that is not an id", { lastChannel: { hearth: 7 } }],
    [
      "a community place with no community",
      { place: { kind: "community", channel_id: null } },
    ],
    ["a conversation with no channel", { place: { kind: "conversation" } }],
    ["drafts that are a list", { drafts: [] }],
  ])("refuses %s", (_label, change) => {
    const saved = { place: null, lastChannel: {}, drafts: {}, ...change };
    expect(() => sessionCopy.restore(saved as never)).toThrow();
  });

  it("is empty after sign-out", () => {
    const { port, session } = setup();
    session.openChannel("hearth", "general");
    session.setDraft("general", { body: "a", reply_to_id: null });
    session.clear();
    expect(port.get()).toEqual(createSessionState());
  });
});
