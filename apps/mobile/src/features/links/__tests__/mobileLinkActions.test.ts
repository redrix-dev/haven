import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLinkPipeline } from "@shared/core/linkPipeline";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  createMobileLinkActionHandler,
  isRecoveryLink,
  type AuthConfirmLinkIntent,
} from "../mobileLinkActions";
import {
  dispatchLinkIntent,
  openLinkIntent,
  useMobilePushNavigationStore,
  type MobilePushNavigationHandlers,
} from "../../../stores/mobilePushNavigationStore";

function fakeDeps() {
  return {
    open: vi.fn(),
    notify: vi.fn(),
    confirmAuth: vi.fn(),
    askToSwitchAccount: vi.fn(),
  };
}

function fakeHandlers() {
  return {
    openDm: vi.fn(),
    openFriends: vi.fn(),
    openMention: vi.fn(),
    openCommunity: vi.fn(),
    openInvite: vi.fn(),
    openNotifications: vi.fn(),
    refreshUrgentSurfaces: vi.fn(),
  } satisfies MobilePushNavigationHandlers;
}

function memoryPersistence(): NexusPersistence {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

const authIntent = (params: Record<string, string>): AuthConfirmLinkIntent => ({
  kind: "auth_confirm",
  client: null,
  params,
});

describe("createMobileLinkActionHandler", () => {
  it("opens a destination", () => {
    const deps = fakeDeps();
    const intent = { kind: "invite", code: "a1b2c3d4e5" } as const;
    createMobileLinkActionHandler(deps)({ type: "open", intent });
    expect(deps.open).toHaveBeenCalledWith(intent);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does nothing for home — the app is already open", () => {
    const deps = fakeDeps();
    createMobileLinkActionHandler(deps)({
      type: "open",
      intent: { kind: "home" },
    });
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("tells a signed-out person an invite waits for sign-in", () => {
    const deps = fakeDeps();
    createMobileLinkActionHandler(deps)({
      type: "deferred",
      intent: { kind: "invite", code: "a1b2c3d4e5" },
    });
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sign in to use this invite" }),
    );
    expect(deps.open).not.toHaveBeenCalled();
  });

  it("uses the general sign-in notice for other destinations", () => {
    const deps = fakeDeps();
    createMobileLinkActionHandler(deps)({
      type: "deferred",
      intent: { kind: "dm", conversationId: "c1" },
    });
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sign in to open this link" }),
    );
  });

  it("confirms an auth link when signed out", () => {
    const deps = fakeDeps();
    const intent = authIntent({ access_token: "at", refresh_token: "rt" });
    createMobileLinkActionHandler(deps)({ type: "confirm_auth", intent });
    expect(deps.confirmAuth).toHaveBeenCalledWith(intent);
    expect(deps.askToSwitchAccount).not.toHaveBeenCalled();
  });

  it("asks before using an auth link while signed in — never exchanges silently", () => {
    const deps = fakeDeps();
    const intent = authIntent({ access_token: "at", refresh_token: "rt" });
    createMobileLinkActionHandler(deps)({
      type: "confirm_auth_while_signed_in",
      intent,
      signedInUserId: "u1",
    });
    expect(deps.askToSwitchAccount).toHaveBeenCalledWith(intent);
    expect(deps.confirmAuth).not.toHaveBeenCalled();
  });

  it("says a Haven link it can't open may need an update", () => {
    const deps = fakeDeps();
    createMobileLinkActionHandler(deps)({
      type: "unsupported",
      input: "haven://some-future-screen",
    });
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Haven can't open that link" }),
    );
  });

  it("ignores development-client launch URLs", () => {
    const deps = fakeDeps();
    createMobileLinkActionHandler(deps)({
      type: "unsupported",
      input:
        "exp+haven-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.2%3A8081",
    });
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("isRecoveryLink", () => {
  it("recognizes a recovery link in any casing", () => {
    expect(isRecoveryLink(authIntent({ type: " Recovery " }))).toBe(true);
  });

  it("does not treat a sign-up confirmation as recovery", () => {
    expect(isRecoveryLink(authIntent({ type: "signup" }))).toBe(false);
    expect(isRecoveryLink(authIntent({}))).toBe(false);
  });
});

describe("mobile links through the shared pipeline", () => {
  it("remembers an invite tapped while signed out and opens it after sign-in", () => {
    const deps = fakeDeps();
    const pipeline = createLinkPipeline({ persistence: memoryPersistence() });
    pipeline.setHandler(createMobileLinkActionHandler(deps));

    pipeline.receive("https://haven.redrixx.com/invite/A1B2C3D4E5", "initial");
    pipeline.setSession(null);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.open).not.toHaveBeenCalled();

    pipeline.setSession("u1");
    expect(deps.open).toHaveBeenCalledTimes(1);
    expect(deps.open).toHaveBeenCalledWith({
      kind: "invite",
      code: "A1B2C3D4E5",
    });
  });

  it("opens the legacy haven://invite link mobile used to share", () => {
    const deps = fakeDeps();
    const pipeline = createLinkPipeline({ persistence: memoryPersistence() });
    pipeline.setHandler(createMobileLinkActionHandler(deps));
    pipeline.setSession("u1");

    pipeline.receive("haven://invite/A1B2C3D4E5", "event");
    expect(deps.open).toHaveBeenCalledWith({
      kind: "invite",
      code: "A1B2C3D4E5",
    });
  });
});

describe("dispatchLinkIntent", () => {
  it("opens the join sheet for an invite — it never joins", () => {
    const handlers = fakeHandlers();
    dispatchLinkIntent(handlers, { kind: "invite", code: "A1B2C3D4E5" });
    expect(handlers.openInvite).toHaveBeenCalledWith("A1B2C3D4E5");
  });

  it("routes each destination to its screen", () => {
    const handlers = fakeHandlers();
    dispatchLinkIntent(handlers, { kind: "community", communityId: "s1" });
    dispatchLinkIntent(handlers, {
      kind: "channel",
      communityId: "s1",
      channelId: "ch1",
    });
    dispatchLinkIntent(handlers, { kind: "dm", conversationId: "c1" });
    dispatchLinkIntent(handlers, {
      kind: "friends",
      tab: "requests",
      requestId: "fr1",
    });
    dispatchLinkIntent(handlers, { kind: "notifications" });

    expect(handlers.openCommunity).toHaveBeenCalledWith("s1");
    expect(handlers.openMention).toHaveBeenCalledWith("s1", "ch1");
    expect(handlers.openDm).toHaveBeenCalledWith("c1");
    expect(handlers.openFriends).toHaveBeenCalledWith({
      tab: "requests",
      highlightedRequestId: "fr1",
    });
    expect(handlers.openNotifications).toHaveBeenCalledTimes(1);
  });

  it("navigates nowhere for links without a destination", () => {
    const handlers = fakeHandlers();
    dispatchLinkIntent(handlers, { kind: "home" });
    dispatchLinkIntent(handlers, authIntent({ code: "x" }));
    dispatchLinkIntent(handlers, { kind: "unsupported", input: "haven://x" });
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });
});

describe("openLinkIntent", () => {
  beforeEach(() => {
    useMobilePushNavigationStore.setState({
      handlers: null,
      pendingLinkIntent: null,
      pendingParsedPayload: null,
    });
  });

  it("holds a link until the signed-in shell registers, then opens it once", () => {
    openLinkIntent({ kind: "invite", code: "A1B2C3D4E5" });
    expect(useMobilePushNavigationStore.getState().pendingLinkIntent).toEqual({
      kind: "invite",
      code: "A1B2C3D4E5",
    });

    const handlers = fakeHandlers();
    useMobilePushNavigationStore.getState().setHandlers(handlers);
    expect(handlers.openInvite).toHaveBeenCalledTimes(1);
    expect(
      useMobilePushNavigationStore.getState().pendingLinkIntent,
    ).toBeNull();

    useMobilePushNavigationStore.getState().setHandlers(null);
    useMobilePushNavigationStore.getState().setHandlers(handlers);
    expect(handlers.openInvite).toHaveBeenCalledTimes(1);
  });

  it("opens immediately when the shell is already registered", () => {
    const handlers = fakeHandlers();
    useMobilePushNavigationStore.getState().setHandlers(handlers);
    openLinkIntent({ kind: "dm", conversationId: "c1" });
    expect(handlers.openDm).toHaveBeenCalledWith("c1");
    expect(
      useMobilePushNavigationStore.getState().pendingLinkIntent,
    ).toBeNull();
  });
});
