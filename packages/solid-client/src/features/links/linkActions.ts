import type { LinkAction, SessionLinkIntent } from "@shared/core/linkPipeline";
import {
  buildHavenLinkPath,
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
  confirmAuth: (intent: AuthConfirmLinkIntent) => void;
  askToSwitchAccount: (
    intent: AuthConfirmLinkIntent,
    signedInUserId: string,
  ) => void;
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

/**
 * Carry out what the shared link pipeline decided. Desktop and web share this;
 * only the deps differ.
 */
export function createLinkActionHandler(
  deps: LinkActionDeps,
): (action: LinkAction) => void {
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
        deps.navigate("/auth/confirm");
        deps.confirmAuth(action.intent);
        return;
      case "confirm_auth_while_signed_in":
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
