import { describe, expect, it, vi } from "vitest";
import type { LinkAction } from "@shared/core/linkPipeline";
import { createLinkActionHandler } from "../linkActions";

const INVITE = { kind: "invite", code: "ABCDEF0123" } as const;
const AUTH = {
  kind: "auth_confirm",
  client: "desktop",
  params: { token_hash: "th", type: "signup" },
} as const;

function setup() {
  const deps = {
    navigate: vi.fn(),
    notify: vi.fn(),
    confirmAuth: vi.fn(),
    askToSwitchAccount: vi.fn(),
  };
  return { deps, handle: createLinkActionHandler(deps) };
}

describe("createLinkActionHandler", () => {
  it("opens an invite on the pre-filled invite screen and does nothing else", () => {
    const { deps, handle } = setup();
    handle({ type: "open", intent: INVITE });
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/invite/ABCDEF0123");
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.confirmAuth).not.toHaveBeenCalled();
  });

  it.each<[string, LinkAction, string]>([
    ["home", { type: "open", intent: { kind: "home" } }, "/"],
    [
      "a channel",
      {
        type: "open",
        intent: { kind: "channel", communityId: "c1", channelId: "ch1" },
      },
      "/community/c1/channel/ch1",
    ],
    [
      "a DM",
      { type: "open", intent: { kind: "dm", conversationId: "d1" } },
      "/direct-messages/d1",
    ],
    [
      "the friend requests tab",
      {
        type: "open",
        intent: { kind: "friends", tab: "requests", requestId: "fr1" },
      },
      "/friends?tab=requests&request=fr1",
    ],
    [
      "notifications",
      { type: "open", intent: { kind: "notifications" } },
      "/notifications",
    ],
  ])("navigates to %s", (_label, action, path) => {
    const { deps, handle } = setup();
    handle(action);
    expect(deps.navigate).toHaveBeenCalledWith(path);
  });

  it("asks a signed-out person to sign in without pulling them off the screen they're on", () => {
    const { deps, handle } = setup();
    handle({ type: "deferred", intent: INVITE });
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sign in to use this invite" }),
    );
  });

  it("uses general copy for a deferred link that isn't an invite", () => {
    const { deps, handle } = setup();
    handle({ type: "deferred", intent: { kind: "notifications" } });
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sign in to open this link" }),
    );
  });

  it("shows the confirm screen, then exchanges the auth link", () => {
    const { deps, handle } = setup();
    handle({ type: "confirm_auth", intent: AUTH });
    expect(deps.navigate).toHaveBeenCalledWith("/auth/confirm");
    expect(deps.confirmAuth).toHaveBeenCalledWith(AUTH);
    expect(deps.navigate.mock.invocationCallOrder[0]).toBeLessThan(
      deps.confirmAuth.mock.invocationCallOrder[0],
    );
  });

  it("asks before switching accounts and never exchanges the link on its own", () => {
    const { deps, handle } = setup();
    handle({
      type: "confirm_auth_while_signed_in",
      intent: AUTH,
      signedInUserId: "u1",
    });
    expect(deps.askToSwitchAccount).toHaveBeenCalledWith(AUTH, "u1");
    expect(deps.confirmAuth).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("explains an unsupported link without navigating", () => {
    const { deps, handle } = setup();
    handle({ type: "unsupported", input: "haven://nope" });
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Haven can't open that link" }),
    );
  });
});
