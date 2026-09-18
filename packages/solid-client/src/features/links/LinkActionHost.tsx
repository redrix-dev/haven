import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { ConfirmDialog } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useBridge } from "@solid-client/contexts/BridgeProvider";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useToast } from "@solid-client/contexts/ToastProvider";
import {
  createLinkActionHandler,
  isConsumedBySupabaseOnWeb,
  type AuthConfirmLinkIntent,
} from "./linkActions";
import { OpenInAppHandOff } from "./OpenInAppHandOff";
import { planWebLinkHandOff, type WebLinkHandOff } from "./webLinkHandOff";

/**
 * Connects the shared link pipeline (`core.links`) to this app and carries out
 * the actions it decides on.
 *
 * - Desktop: native deep links arrive through `bridge.onDeepLink`.
 * - Web: there is no `onDeepLink`; the page URL the app loaded with is the
 *   link, if it is one (`linkFromPageUrl`). On a computer a destination link
 *   is offered to the installed app first (`OpenInAppHandOff`) and reaches
 *   the pipeline only on "Continue in browser". Auth links Supabase's
 *   `detectSessionInUrl` already consumes are left to it.
 *
 * Mount once, inside the router and every provider it uses. It renders only
 * the app hand-off and the "already signed in" confirmation.
 */
export function LinkActionHost() {
  const core = requireHavenSolidCore();
  const bridge = useBridge();
  const navigate = useNavigate();
  const toast = useToast();
  const { session, signOut, confirmAuthLink } = useSession();
  const isWebShell = !bridge.onDeepLink;

  // Captured during render: before any navigation, and before Supabase clears
  // URL tokens (it only does so after a network round-trip).
  const initialHref = typeof window !== "undefined" ? window.location.href : "";

  const [switchTarget, setSwitchTarget] =
    createSignal<AuthConfirmLinkIntent | null>(null);
  const [switching, setSwitching] = createSignal(false);
  const [handOff, setHandOff] = createSignal<WebLinkHandOff | null>(null);

  const continueInBrowser = () => {
    const pending = handOff();
    setHandOff(null);
    if (pending) core.links.receive(pending.link, "initial");
  };

  onMount(() => {
    core.links.setHandler(
      createLinkActionHandler({
        // On web the page is usually already at the path, and Back shouldn't
        // return to sign-in, so opens replace the history entry.
        navigate: (path) =>
          navigate(path, isWebShell ? { replace: true } : undefined),
        notify: (input) => toast.show(input),
        // Desktop got here from a button the person already pressed in their
        // browser, so it exchanges straight away. On web the landing page asks.
        confirmAuth: isWebShell
          ? undefined
          : (intent) => void confirmAuthLink(intent.params),
        askToSwitchAccount: (intent) => setSwitchTarget(intent),
        ignoreAuthLink: isWebShell ? isConsumedBySupabaseOnWeb : undefined,
      }),
    );
    onCleanup(() => core.links.setHandler(null));

    const subscribe = bridge.onDeepLink;
    if (!subscribe) {
      const plan = planWebLinkHandOff(initialHref, window.location.origin, {
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      });
      if (plan?.appLink) setHandOff(plan);
      else if (plan) core.links.receive(plan.link, "initial");
      return;
    }

    let disposed = false;
    let dispose: (() => void) | undefined;
    void subscribe((url, source) => core.links.receive(url, source)).then(
      (unsubscribe) => {
        if (disposed) unsubscribe();
        else dispose = unsubscribe;
      },
    );
    onCleanup(() => {
      disposed = true;
      dispose?.();
    });
  });

  const switchAccount = async () => {
    const intent = switchTarget();
    if (!intent) return;
    setSwitching(true);
    try {
      await signOut();
      navigate("/auth/confirm");
      await confirmAuthLink(intent.params);
    } finally {
      setSwitching(false);
      setSwitchTarget(null);
    }
  };

  return (
    <>
      <Show when={handOff()?.appLink}>
        {(appLink) => (
          <OpenInAppHandOff
            appLink={appLink()}
            onContinueInBrowser={continueInBrowser}
          />
        )}
      </Show>
      <ConfirmDialog
        open={switchTarget() !== null}
        title="You're already signed in"
        description={`You're signed in as ${
          session()?.user.email ?? "another account"
        }. Sign out and continue with this link?`}
        confirmLabel="Sign out and continue"
        pending={switching()}
        onConfirm={() => void switchAccount()}
        onCancel={() => setSwitchTarget(null)}
      />
    </>
  );
}
