import type { LinkAction, SessionLinkIntent } from "@shared/core/linkPipeline";
import type { HavenLinkIntent } from "@shared/features/links";

export type AuthConfirmLinkIntent = Extract<
  HavenLinkIntent,
  { kind: "auth_confirm" }
>;

export type MobileLinkNotice = { title: string; body: string };

/** What mobile can do in response to a link. Injected so the mapping is testable. */
export type MobileLinkActionDeps = {
  /** Navigate to a destination; for an invite, the pre-filled join sheet. */
  open: (intent: SessionLinkIntent) => void;
  notify: (notice: MobileLinkNotice) => void;
  confirmAuth: (intent: AuthConfirmLinkIntent) => void;
  askToSwitchAccount: (intent: AuthConfirmLinkIntent) => void;
};

const signInFirst = (intent: SessionLinkIntent): MobileLinkNotice =>
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
 * Only links meant for Haven earn a "can't open" notice. Development builds
 * also launch with `exp+…://expo-development-client/…` URLs, which are not.
 */
const isHavenLinkInput = (input: string): boolean =>
  /^(haven:|https:)/i.test(input.trim());

export const isRecoveryLink = (intent: AuthConfirmLinkIntent): boolean => {
  const type: string | undefined = intent.params.type;
  return type?.trim().toLowerCase() === "recovery";
};

/** Carry out what the shared link pipeline decided, on mobile. */
export function createMobileLinkActionHandler(
  deps: MobileLinkActionDeps,
): (action: LinkAction) => void {
  return (action) => {
    switch (action.type) {
      case "open":
        // "home" is the app itself; it's already open.
        if (action.intent.kind !== "home") deps.open(action.intent);
        return;
      case "deferred":
        deps.notify(signInFirst(action.intent));
        return;
      case "confirm_auth":
        deps.confirmAuth(action.intent);
        return;
      case "confirm_auth_while_signed_in":
        deps.askToSwitchAccount(action.intent);
        return;
      case "unsupported":
        if (!isHavenLinkInput(action.input)) return;
        deps.notify({
          title: "Haven can't open that link",
          body: "It may need a newer version of Haven.",
        });
        return;
    }
  };
}
