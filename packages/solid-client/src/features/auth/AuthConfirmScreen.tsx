import {
  Match,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { useBridge } from "@solid-client/contexts/BridgeProvider";
import { Button } from "@solid-client/components/ui";
import { parseHavenLink } from "@shared/features/links";
import { planAuthConfirm } from "./authConfirmPlan";

/**
 * Landing page for confirmation and recovery email links —
 * `/auth/confirm/:client` and the legacy `/auth/confirm`.
 *
 * The link itself never signs anyone in (checklist D2). This page reads it and
 * offers the one action that fits: confirm here, or open the app that asked for
 * it. Inside the desktop shell there's nothing to ask — the link pipeline has
 * already exchanged the deep link — so it just waits for the session, then
 * sends the person on (to the app, or to set-new-password via the recovery gate
 * in AppLayout).
 */
export function AuthConfirmScreen() {
  const { session, authConfirmError, confirmAuthLink } = useSession();
  const bridge = useBridge();
  const navigate = useNavigate();

  // Read the address during render: before any navigation, and before Supabase
  // clears tokens from the URL (it only does so after a network round-trip).
  const href = typeof window !== "undefined" ? window.location.href : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = parseHavenLink(href, {
    appOrigins: origin.startsWith("http") ? [origin] : [],
  });
  const params = link.kind === "auth_confirm" ? link.params : {};
  const client = link.kind === "auth_confirm" ? link.client : null;

  const [timedOut, setTimedOut] = createSignal(false);
  const [continueInBrowser, setContinueInBrowser] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const plan = createMemo(() =>
    planAuthConfirm({
      client,
      params,
      // The desktop shell is the one with a deep-link bridge.
      shell: bridge.onDeepLink ? "app" : "browser",
      continueInBrowser: continueInBrowser(),
    }),
  );

  /** Narrowed for the hand-off branch, so the link is typed rather than cast. */
  const handOff = createMemo(() => {
    const current = plan();
    return current.kind === "open_app" ? current : null;
  });

  // Ask the browser to open the app once, as the invite hand-off does; the
  // button below stays for browsers that block a launch nobody clicked. Only
  // the app spends the token, so the browser's prompt is still the click
  // scanners can't make (checklist D2).
  let launched = false;
  createEffect(() => {
    const current = handOff();
    if (!current || launched) return;
    launched = true;
    window.location.assign(current.appLink);
  });

  // Leave only once the session exists. The recovery gate is raised *before*
  // the exchange, so leaving on it alone reached AppLayout with no session yet,
  // which redirected to /sign-in and stranded the recovery session there. With
  // the session in hand, AppLayout shows ResetPasswordScreen from the gate; if
  // the exchange fails, staying here shows why.
  createEffect(() => {
    if (session()) navigate("/", { replace: true });
  });

  onMount(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000);
    onCleanup(() => clearTimeout(timer));
  });

  // Waiting is the only state that can hang: the shell or Supabase is
  // exchanging and only success is observable. A link we act on reports its own
  // failure, so it never needs the timeout.
  const failure = () => {
    const current = plan();
    if (current.kind === "error") return current.message;
    if (authConfirmError()) return authConfirmError();
    return current.kind === "working" && timedOut()
      ? "The link may have expired or already been used. Request a new one from the sign-in screen."
      : null;
  };

  const purpose = () => params.type?.trim().toLowerCase() ?? "";
  const title = () =>
    purpose() === "recovery" ? "Reset your password" : "Confirm your email";
  const action = () => (purpose() === "recovery" ? "Continue" : "Confirm");

  const confirm = async () => {
    setBusy(true);
    const result = await confirmAuthLink(params);
    // On success the session effect above navigates; on failure the error
    // surfaces through authConfirmError.
    if (result.error) setBusy(false);
  };

  return (
    <div class="flex h-full w-full items-center justify-center bg-background p-6">
      <Switch>
        <Match when={failure()}>
          {(message) => (
            <div class="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-center shadow-lg">
              <h1 class="text-lg font-semibold text-foreground">
                Couldn't confirm that link
              </h1>
              <p class="text-sm text-muted-foreground">{message()}</p>
              <A
                href="/sign-in"
                class="inline-block text-sm font-medium text-primary hover:underline"
              >
                Back to sign in
              </A>
            </div>
          )}
        </Match>

        <Match when={handOff()}>
          {(handOffPlan) => (
            <div class="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-center shadow-lg">
              <h1 class="text-lg font-semibold text-foreground">{title()}</h1>
              <p class="text-sm text-muted-foreground">
                This link was sent from the Haven app. Open it there to finish —
                tick “Always allow” in your browser's prompt to skip this step
                next time.
              </p>
              <a
                href={handOffPlan().appLink}
                class="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open Haven
              </a>
              <button
                type="button"
                onClick={() => setContinueInBrowser(true)}
                class="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Continue in browser
              </button>
            </div>
          )}
        </Match>

        <Match when={plan().kind === "confirm"}>
          <div class="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-center shadow-lg">
            <h1 class="text-lg font-semibold text-foreground">{title()}</h1>
            <p class="text-sm text-muted-foreground">
              You asked for this link. Press the button to finish.
            </p>
            <Button
              class="w-full"
              disabled={busy()}
              onClick={() => void confirm()}
            >
              {busy() ? "Working…" : action()}
            </Button>
          </div>
        </Match>

        <Match when={plan().kind === "working"}>
          <div class="flex flex-col items-center gap-3 text-muted-foreground">
            <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p class="text-sm">Confirming…</p>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
