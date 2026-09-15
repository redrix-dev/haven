import { describe, expect, it, vi } from "vitest";
import type { LinkAction } from "@shared/core/linkPipeline";
import {
  createLinkActionHandler,
  isConsumedBySupabaseOnWeb,
  linkFromPageUrl,
  type AuthConfirmLinkIntent,
} from "../linkActions";

const INVITE = { kind: "invite", code: "ABCDEF0123" } as const;
const AUTH = {
  kind: "auth_confirm",
  client: "desktop",
  params: { token_hash: "th", type: "signup" },
} as const;
const AUTH_PATH = "/auth/confirm/desktop?token_hash=th&type=signup";

const authLink = (params: Record<string, string>): AuthConfirmLinkIntent => ({
  kind: "auth_confirm",
  client: null,
  params,
});
const IMPLICIT = authLink({
  access_token: "at",
  refresh_token: "rt",
  type: "signup",
});
const PKCE = authLink({ code: "pkce-code" });
const TOKEN_HASH = authLink({ token_hash: "th", type: "signup" });
const URL_ERROR = authLink({ error_description: "Email link is invalid" });

/**
 * `web: true` is the browser shell: it leaves Supabase's own flows alone and
 * never exchanges a link on arrival — the landing page asks first.
 */
function setup(options: { web?: boolean } = {}) {
  const confirmAuth = vi.fn();
  const deps = {
    navigate: vi.fn(),
    notify: vi.fn(),
    askToSwitchAccount: vi.fn(),
    confirmAuth: options.web ? undefined : confirmAuth,
    ignoreAuthLink: options.web ? isConsumedBySupabaseOnWeb : undefined,
  };
  return { deps, confirmAuth, handle: createLinkActionHandler(deps) };
}

describe("createLinkActionHandler", () => {
  it("opens an invite on the pre-filled invite screen and does nothing else", () => {
    const { deps, confirmAuth, handle } = setup();
    handle({ type: "open", intent: INVITE });
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/invite/ABCDEF0123");
    expect(deps.notify).not.toHaveBeenCalled();
    expect(confirmAuth).not.toHaveBeenCalled();
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

  it("opens the landing page for the client that asked, then exchanges", () => {
    const { deps, confirmAuth, handle } = setup();
    handle({ type: "confirm_auth", intent: AUTH });
    expect(deps.navigate).toHaveBeenCalledWith(AUTH_PATH);
    expect(confirmAuth).toHaveBeenCalledWith(AUTH);
    expect(deps.navigate.mock.invocationCallOrder[0]).toBeLessThan(
      confirmAuth.mock.invocationCallOrder[0],
    );
  });

  it("keeps the legacy clientless path for links that carry no client", () => {
    const { deps, handle } = setup();
    handle({ type: "confirm_auth", intent: TOKEN_HASH });
    expect(deps.navigate).toHaveBeenCalledWith(
      "/auth/confirm?token_hash=th&type=signup",
    );
  });

  it("asks before switching accounts and never exchanges the link on its own", () => {
    const { deps, confirmAuth, handle } = setup();
    handle({
      type: "confirm_auth_while_signed_in",
      intent: AUTH,
      signedInUserId: "u1",
    });
    expect(deps.askToSwitchAccount).toHaveBeenCalledWith(AUTH, "u1");
    expect(confirmAuth).not.toHaveBeenCalled();
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

describe("isConsumedBySupabaseOnWeb", () => {
  it("is true for Supabase's own URL flows", () => {
    expect(isConsumedBySupabaseOnWeb(IMPLICIT)).toBe(true);
    expect(isConsumedBySupabaseOnWeb(PKCE)).toBe(true);
  });

  it("is false for what Supabase leaves to the app", () => {
    expect(isConsumedBySupabaseOnWeb(TOKEN_HASH)).toBe(false);
    expect(isConsumedBySupabaseOnWeb(URL_ERROR)).toBe(false);
  });
});

describe("web shell: auth links Supabase already consumed", () => {
  it("never re-exchanges an implicit or PKCE link", () => {
    for (const intent of [IMPLICIT, PKCE]) {
      const { deps, confirmAuth, handle } = setup({ web: true });
      handle({ type: "confirm_auth", intent });
      expect(confirmAuth).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
    }
  });

  it("doesn't ask about switching accounts Supabase has already switched", () => {
    const { deps, handle } = setup({ web: true });
    handle({
      type: "confirm_auth_while_signed_in",
      intent: IMPLICIT,
      signedInUserId: "u1",
    });
    expect(deps.askToSwitchAccount).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a token_hash link",
      TOKEN_HASH,
      "/auth/confirm?token_hash=th&type=signup",
    ],
    [
      "a link carrying an error",
      URL_ERROR,
      "/auth/confirm?error_description=Email%20link%20is%20invalid",
    ],
  ])(
    "shows %s on the landing page and leaves the exchange to it",
    (_label, intent, path) => {
      const { deps, confirmAuth, handle } = setup({ web: true });
      handle({ type: "confirm_auth", intent });
      expect(deps.navigate).toHaveBeenCalledWith(path);
      // The browser never spends the token on arrival — a person's click does.
      expect(confirmAuth).not.toHaveBeenCalled();
    },
  );
});

describe("linkFromPageUrl", () => {
  const origin = "https://haven.redrixx.com";

  it.each([
    "/invite/ABCDEF0123",
    "/community/c1",
    "/community/c1/channel/ch1",
    "/direct-messages/d1",
    "/friends",
    "/notifications",
    "/auth/confirm#access_token=at&refresh_token=rt&type=signup",
    "/auth/confirm?token_hash=th&type=signup",
    "/auth/confirm/web?token_hash=th&type=signup",
    "/auth/confirm/desktop?token_hash=th&type=recovery",
    "/auth/confirm#error_description=Email+link+is+invalid",
  ])("treats %s as a link", (path) => {
    const href = `${origin}${path}`;
    expect(linkFromPageUrl(href, origin)).toBe(href);
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/settings/profile",
    "/communities",
    "/community/c1/roles",
    "/auth/confirm",
    "/auth/confirm/web",
  ])("treats %s as an ordinary page", (path) => {
    expect(linkFromPageUrl(`${origin}${path}`, origin)).toBeNull();
  });

  it("counts the page's own preview origin", () => {
    const preview = "https://haven-abc123-cody-magnusons-projects.vercel.app";
    const href = `${preview}/invite/ABCDEF0123`;
    expect(linkFromPageUrl(href, preview)).toBe(href);
  });

  it("ignores a link to another site", () => {
    expect(
      linkFromPageUrl("https://evil.example/invite/ABCDEF0123", origin),
    ).toBeNull();
  });
});
