import { describe, expect, it } from "vitest";
import {
  createLinkPipeline,
  LINK_DEDUPE_WINDOW_MS,
  PENDING_LINK_TTL_MS,
  type LinkAction,
  type LinkPipeline,
} from "../linkPipeline";
import type { NexusPersistence } from "../persistence/NexusPersistence";
import { createMemoryPersistence } from "../persistence/createMemoryPersistence";
import { NEXUS_STORAGE_KEYS } from "../persistence/nexusStorageKeys";

const PENDING_KEY = NEXUS_STORAGE_KEYS.pendingLink;
const HOUR = 60 * 60 * 1000;

const INVITE_URL = "https://haven.redrixx.com/invite/ABCDEF0123";
const OTHER_INVITE_URL = "https://haven.redrixx.com/invite/0123456789";
const AUTH_URL =
  "https://haven.redrixx.com/auth/confirm/desktop?token_hash=th&type=signup";

const INVITE = { kind: "invite", code: "ABCDEF0123" };
const OTHER_INVITE = { kind: "invite", code: "0123456789" };
const AUTH = {
  kind: "auth_confirm",
  client: "desktop",
  params: { token_hash: "th", type: "signup" },
};

type Harness = {
  pipeline: LinkPipeline;
  persistence: NexusPersistence;
  actions: LinkAction[];
  advance: (ms: number) => void;
  /** Same storage and clock, fresh process — an app restart. */
  restart: () => Harness;
};

function setup(
  persistence: NexusPersistence = createMemoryPersistence(),
  clock = { now: Date.UTC(2026, 8, 15, 12) },
): Harness {
  const pipeline = createLinkPipeline({ persistence, now: () => clock.now });
  const actions: LinkAction[] = [];
  pipeline.setHandler((action) => actions.push(action));
  return {
    pipeline,
    persistence,
    actions,
    advance: (ms) => {
      clock.now += ms;
    },
    restart: () => setup(persistence, clock),
  };
}

const opens = (actions: LinkAction[]) =>
  actions.filter((action) => action.type === "open");

describe("before the session is known", () => {
  it("holds links, then routes them in arrival order once it resolves", () => {
    const { pipeline, actions } = setup();
    pipeline.receive(INVITE_URL, "initial");
    pipeline.receive("haven://nope/x");
    expect(actions).toEqual([]);

    pipeline.setSession("u1");
    expect(actions).toEqual([
      { type: "open", intent: INVITE },
      { type: "unsupported", input: "haven://nope/x" },
    ]);
  });
});

describe("signed out, then signed in", () => {
  it("remembers a destination and opens it exactly once after sign-in", () => {
    const { pipeline, persistence, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    expect(actions).toEqual([{ type: "deferred", intent: INVITE }]);
    expect(persistence.getString(PENDING_KEY)).not.toBeNull();

    pipeline.setSession("u1");
    pipeline.setSession("u1"); // Supabase fires several session events per sign-in
    expect(opens(actions)).toEqual([{ type: "open", intent: INVITE }]);
    expect(persistence.getString(PENDING_KEY)).toBeNull();
  });

  it("keeps the invite through sign-up and email confirmation", () => {
    const { pipeline, persistence, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.receive(AUTH_URL);
    expect(actions).toEqual([
      { type: "deferred", intent: INVITE },
      { type: "confirm_auth", intent: AUTH },
    ]);
    expect(persistence.getString(PENDING_KEY)).not.toBeNull();

    pipeline.setSession("new-user");
    expect(opens(actions)).toEqual([{ type: "open", intent: INVITE }]);
  });

  it("opens the pre-filled invite screen and never produces a join", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    actions.length = 0;

    pipeline.setSession("u1");
    expect(actions).toEqual([{ type: "open", intent: INVITE }]);
  });

  it("keeps only the latest link clicked while signed out", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.receive(OTHER_INVITE_URL);

    pipeline.setSession("u1");
    expect(opens(actions)).toEqual([{ type: "open", intent: OTHER_INVITE }]);
  });

  it("survives an app restart", () => {
    const first = setup();
    first.pipeline.setSession(null);
    first.pipeline.receive(INVITE_URL);

    const second = first.restart();
    second.pipeline.setSession("u1");
    expect(second.actions).toEqual([{ type: "open", intent: INVITE }]);
  });

  it("opens a remembered link before one that arrived while the session loaded", () => {
    const first = setup();
    first.pipeline.setSession(null);
    first.pipeline.receive(INVITE_URL);

    const second = first.restart();
    second.pipeline.receive(OTHER_INVITE_URL, "initial");
    second.pipeline.setSession("u1");
    expect(second.actions).toEqual([
      { type: "open", intent: INVITE },
      { type: "open", intent: OTHER_INVITE },
    ]);
  });
});

describe("signed in", () => {
  it("opens destinations immediately and remembers nothing", () => {
    const { pipeline, persistence, actions } = setup();
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL);
    pipeline.receive("/?kind=dm_message&conversationId=c1");
    expect(actions).toEqual([
      { type: "open", intent: INVITE },
      { type: "open", intent: { kind: "dm", conversationId: "c1" } },
    ]);
    expect(persistence.getString(PENDING_KEY)).toBeNull();
  });

  it("flags an auth link instead of silently swapping accounts", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession("u1");
    pipeline.receive(AUTH_URL);
    expect(actions).toEqual([
      {
        type: "confirm_auth_while_signed_in",
        intent: AUTH,
        signedInUserId: "u1",
      },
    ]);
  });
});

describe("links that don't need a session", () => {
  it("sends auth links straight to confirmation when signed out", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(AUTH_URL);
    expect(actions).toEqual([{ type: "confirm_auth", intent: AUTH }]);
  });

  it("opens home without remembering it", () => {
    const { pipeline, persistence, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive("haven://");
    expect(actions).toEqual([{ type: "open", intent: { kind: "home" } }]);
    expect(persistence.getString(PENDING_KEY)).toBeNull();
  });

  it("reports links this build can't open, signed in or out", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive("haven://nope/x");
    expect(actions).toEqual([{ type: "unsupported", input: "haven://nope/x" }]);
  });

  it("ignores empty input", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession("u1");
    pipeline.receive("   ");
    expect(actions).toEqual([]);
  });
});

describe("duplicate deliveries and replays", () => {
  it("runs one click delivered by two paths only once", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL);
    pipeline.receive(INVITE_URL);
    expect(actions).toHaveLength(1);
  });

  it("runs the same link again when clicked again after the window", () => {
    const { pipeline, actions, advance } = setup();
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL);
    advance(LINK_DEDUPE_WINDOW_MS);
    pipeline.receive(INVITE_URL);
    expect(actions).toHaveLength(2);
  });

  it("ignores a cold-start replay of a link that already ran", () => {
    const { pipeline, actions, advance } = setup();
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL);
    advance(HOUR);
    pipeline.receive(INVITE_URL, "initial");
    expect(actions).toHaveLength(1);
  });

  it("runs a launch link once even when getCurrent() replays it later", () => {
    const { pipeline, actions, advance } = setup();
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL, "initial");
    advance(HOUR);
    pipeline.receive(INVITE_URL, "initial");
    expect(actions).toHaveLength(1);
  });

  it("doesn't re-defer a duplicate while signed out", () => {
    const { pipeline, actions } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.receive(INVITE_URL);
    expect(actions).toEqual([{ type: "deferred", intent: INVITE }]);
  });
});

describe("remembered link expiry (7 days)", () => {
  it("discards a remembered link at 7 days", () => {
    const { pipeline, persistence, actions, advance } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    actions.length = 0;

    advance(PENDING_LINK_TTL_MS);
    pipeline.setSession("u1");
    expect(actions).toEqual([]);
    expect(persistence.getString(PENDING_KEY)).toBeNull();
  });

  it("still opens it just inside 7 days", () => {
    const { pipeline, actions, advance } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);

    advance(PENDING_LINK_TTL_MS - 1);
    pipeline.setSession("u1");
    expect(opens(actions)).toEqual([{ type: "open", intent: INVITE }]);
  });

  it.each([
    ["corrupt JSON", "{nope"],
    [
      "an unknown version",
      JSON.stringify({ v: 2, input: INVITE_URL, storedAt: 0 }),
    ],
    ["a missing input", JSON.stringify({ v: 1, storedAt: 0 })],
  ])("drops %s without throwing", (_label, stored) => {
    const persistence = createMemoryPersistence();
    persistence.set(PENDING_KEY, stored);
    const { pipeline, actions } = setup(persistence);

    expect(() => pipeline.setSession("u1")).not.toThrow();
    expect(actions).toEqual([]);
    expect(persistence.getString(PENDING_KEY)).toBeNull();
  });
});

describe("handler timing", () => {
  it("queues actions until the platform attaches a handler, then delivers in order", () => {
    const pipeline = createLinkPipeline({
      persistence: createMemoryPersistence(),
      now: () => 0,
    });
    pipeline.setSession("u1");
    pipeline.receive(INVITE_URL);
    pipeline.receive("haven://notifications");

    const actions: LinkAction[] = [];
    pipeline.setHandler((action) => actions.push(action));
    expect(actions).toEqual([
      { type: "open", intent: INVITE },
      { type: "open", intent: { kind: "notifications" } },
    ]);
  });
});
