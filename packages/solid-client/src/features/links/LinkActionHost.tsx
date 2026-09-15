import { createSignal, onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { ConfirmDialog } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useBridge } from "@solid-client/contexts/BridgeProvider";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useToast } from "@solid-client/contexts/ToastProvider";
import {
  createLinkActionHandler,
  type AuthConfirmLinkIntent,
} from "./linkActions";

/**
 * Connects the shared link pipeline (`core.links`) to this app: feeds native
 * deep links into it — Tauri only; the web shell has no `onDeepLink` — and
 * carries out the actions it decides on.
 *
 * Mount once, inside the router and every provider it uses. It renders only
 * the "already signed in" confirmation.
 */
export function LinkActionHost() {
  const core = requireHavenSolidCore();
  const bridge = useBridge();
  const navigate = useNavigate();
  const toast = useToast();
  const { session, signOut, confirmAuthLink } = useSession();

  const [switchTarget, setSwitchTarget] =
    createSignal<AuthConfirmLinkIntent | null>(null);
  const [switching, setSwitching] = createSignal(false);

  onMount(() => {
    core.links.setHandler(
      createLinkActionHandler({
        navigate: (path) => navigate(path),
        notify: (input) => toast.show(input),
        confirmAuth: (intent) => void confirmAuthLink(intent.params),
        askToSwitchAccount: (intent) => setSwitchTarget(intent),
      }),
    );
    onCleanup(() => core.links.setHandler(null));

    const subscribe = bridge.onDeepLink;
    if (!subscribe) return;
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
  );
}
