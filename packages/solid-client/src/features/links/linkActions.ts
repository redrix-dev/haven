import type { LinkAction, SessionLinkIntent } from "@shared/core/linkPipeline";
import {
  buildHavenLinkPath,
  parseHavenLink,
  type HavenLinkIntent,
} from "@shared/features/links";
import type { ToastInput } from "@solid-client/contexts/ToastProvider";

export type AuthConfirmLinkIntent = Extract<
  HavenLinkIntent,
  { kind: "auth_confirm" }
>;

/** What this app can do in response to a link. Injected so the mapping is testable. */
export type LinkActionDeps = {
  navigate: (path: string) => void;
  notify: (toast: ToastInput) => void;
  /**
   * Exchange the link without asking. Only a shell the person reached by
   * pressing a button in their browser provides this (desktop). The web shell
   * omits it: there the landing page is the button (checklist D2).
   */
  confirmAuth?: (intent: AuthConfirmLinkIntent) => void;
  askToSwitchAccount: (
    intent: AuthConfirmLinkIntent,
    signedInUserId: string,
  ) => void;
  /**
   * An auth link this shell must leave entirely alone — no confirm screen, no
   * exchange, no account-switch prompt. Web uses it for the links Supabase's
   * `detectSessionInUrl` already consumes.
   */
  ignoreAuthLink?: (intent: AuthConfirmLinkIntent) => boolean;
};

const signInFirst = (intent: SessionLinkIntent): ToastInput =>
  intent.kind === "invite"
    ? {
        title: "Sign in to use this invite",
        body: "It'll open as soon as you're signed in.",
      }
    : {
        title: "Sign in to open this link",
        body: "We'll take you there as soon as you're signed in.",
      };

const hasParam = (intent: AuthConfirmLinkIntent, key: string): boolean => {
  const value: string | undefined = intent.params[key];
  return Boolean(value?.trim());
};

const AUTH_PARAM_KEYS = [
  "access_token",
  "refresh_token",
  "code",
  "token_hash",
  "error",
  "error_code",
  "error_description",
] as const;

/**
 * Supabase's own URL flows, which its `detectSessionInUrl` consumes on web:
 * implicit `access_token`, and PKCE `code`. Verified against auth-js 2.107.0
 * `_initialize` / `_getSessionFromURL`. Exchanging these again from the web
 * shell would spend a single-use credential twice — and Supabase has already
 * replaced the session by the time the pipeline could ask.
 */
export const isConsumedBySupabaseOnWeb = (
  intent: AuthConfirmLinkIntent,
): boolean => hasParam(intent, "access_token") || hasParam(intent, "code");

/**
 * On web the page URL is the route, so only a real link should reach the
 * pipeline: a destination (invite, community, channel, DM, friends,
 * notifications) or an auth link that carries auth params. Ordinary pages —
 * `/sign-in`, `/settings/…`, home, a reload of a bare `/auth/confirm` — give
 * null. `origin` is the page's own origin, so previews and local dev count.
 */
export function linkFromPageUrl(href: string, origin: string): string | null {
  const intent = parseHavenLink(href, { appOrigins: [origin] });
  switch (intent.kind) {
    case "unsupported":
    case "home":
      return null;
    case "auth_confirm":
      return AUTH_PARAM_KEYS.some((key) => hasParam(intent, key)) ? href : null;
    default:
      return href;
  }
}

/**
 * Carry out what the shared link pipeline decided. Desktop and web share this;
 * only the deps differ.
 */
export function createLinkActionHandler(
  deps: LinkActionDeps,
): (action: LinkAction) => void {
  const ignored = (intent: AuthConfirmLinkIntent) =>
    deps.ignoreAuthLink?.(intent) === true;

  return (action) => {
    switch (action.type) {
      case "open":
        // For an invite this is the pre-filled invite screen; joining stays a click.
        deps.navigate(buildHavenLinkPath(action.intent));
        return;
      case "deferred":
        // No navigation: someone signed out may be mid sign-up, and the auth
        // gate already keeps them on the auth screens.
        deps.notify(signInFirst(action.intent));
        return;
      case "confirm_auth":
        if (ignored(action.intent)) return;
        // The landing page's own address, client and params intact: it decides
        // whether to confirm here or hand the link to an installed app.
        deps.navigate(buildHavenLinkPath(action.intent));
        deps.confirmAuth?.(action.intent);
        return;
      case "confirm_auth_while_signed_in":
        if (ignored(action.intent)) return;
        deps.askToSwitchAccount(action.intent, action.signedInUserId);
        return;
      case "unsupported":
        deps.notify({
          title: "Haven can't open that link",
          body: "It may need a newer version of Haven.",
        });
        return;
    }
  };
}
