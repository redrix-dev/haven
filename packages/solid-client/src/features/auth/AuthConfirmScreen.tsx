import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";

/**
 * Landing page for confirmation / recovery email links (`/auth/confirm`).
 *
 * On web, Supabase's `detectSessionInUrl` consumes the token from the URL and
 * fires the auth event automatically; on desktop the shell exchanges the
 * `haven://` deep link before routing here. Either way this screen just waits
 * for the session (or recovery gate) to settle, then sends the user on — to the
 * app, or to the set-new-password screen via the recovery gate in AppLayout.
 */
export function AuthConfirmScreen() {
  const { session, passwordRecoveryRequired } = useSession();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = createSignal(false);

  createEffect(() => {
    if (passwordRecoveryRequired() || session()) {
      navigate("/", { replace: true });
    }
  });

  onMount(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <div class="flex h-full w-full items-center justify-center bg-background">
      <Show
        when={!timedOut()}
        fallback={
          <div class="w-full max-w-sm space-y-4 rounded-xl bg-card p-8 text-center shadow-lg">
            <h1 class="text-lg font-semibold text-foreground">
              Couldn't confirm that link
            </h1>
            <p class="text-sm text-muted-foreground">
              The link may have expired or already been used. Request a new one
              from the sign-in screen.
            </p>
            <A
              href="/sign-in"
              class="inline-block text-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </A>
          </div>
        }
      >
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p class="text-sm">Confirming…</p>
        </div>
      </Show>
    </div>
  );
}
