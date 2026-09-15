import { describe, expect, it } from "vitest";
import { createLinkPipeline, PENDING_LINK_TTL_MS } from "../linkPipeline";
import type { NexusPersistence } from "../persistence/NexusPersistence";
import { createMemoryPersistence } from "../persistence/createMemoryPersistence";
import { NEXUS_STORAGE_KEYS } from "../persistence/nexusStorageKeys";

// openedLinkOnSignIn exists because navigation is last-call-wins: Supabase
// reports a password sign-in (and the pipeline opens a remembered link) before
// signIn() resolves, so the sign-in screen's own navigate("/") would replace
// the link. The screen asks this first.

const INVITE_URL = "https://haven.redrixx.com/invite/ABCDEF0123";

function setup(persistence: NexusPersistence = createMemoryPersistence()) {
  const clock = { now: Date.UTC(2026, 8, 15, 12) };
  const pipeline = createLinkPipeline({ persistence, now: () => clock.now });
  pipeline.setHandler(() => {});
  return {
    pipeline,
    persistence,
    advance: (ms: number) => {
      clock.now += ms;
    },
  };
}

describe("openedLinkOnSignIn", () => {
  it("is false before anyone signs in", () => {
    const { pipeline } = setup();
    pipeline.setSession(null);
    expect(pipeline.openedLinkOnSignIn()).toBe(false);
  });

  it("is true once a sign-in opens a remembered link", () => {
    const { pipeline } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(true);
  });

  it("is false after a sign-in with nothing remembered", () => {
    const { pipeline } = setup();
    pipeline.setSession(null);
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(false);
  });

  it("is false when the remembered link had expired — so the person still goes home", () => {
    const { pipeline, advance } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    advance(PENDING_LINK_TTL_MS);
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(false);
  });

  it("is false when this build can't open the remembered link", () => {
    const persistence = createMemoryPersistence();
    persistence.set(
      NEXUS_STORAGE_KEYS.pendingLink,
      JSON.stringify({
        v: 1,
        input: "haven://from/a/newer/build",
        storedAt: Date.UTC(2026, 8, 15, 12),
      }),
    );
    const { pipeline } = setup(persistence);
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(false);
  });

  it("stays true through repeat session events for the same user", () => {
    const { pipeline } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.setSession("u1");
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(true);
  });

  it("resets on the next sign-in", () => {
    const { pipeline } = setup();
    pipeline.setSession(null);
    pipeline.receive(INVITE_URL);
    pipeline.setSession("u1");
    pipeline.setSession(null);
    pipeline.setSession("u2");
    expect(pipeline.openedLinkOnSignIn()).toBe(false);
  });

  it("counts a link that arrived while the session was loading", () => {
    const { pipeline } = setup();
    pipeline.receive(INVITE_URL, "initial");
    pipeline.setSession("u1");
    expect(pipeline.openedLinkOnSignIn()).toBe(true);
  });
});
