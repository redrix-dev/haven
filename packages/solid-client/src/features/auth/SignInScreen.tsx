import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";

export function SignInScreen() {
  const { signIn } = useSession();
  // useNavigate() gives us a function to push a new route programmatically.
  // We call navigate("/") after a successful sign-in so the auth guard in
  // AppLayout takes over and renders the app.
  const navigate = useNavigate();

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(email(), password());
    if (result.error) {
      setError(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      setBusy(false);
    } else {
      // Don't clear busy — we stay in the "loading" state while the router
      // transitions to "/". The guard will show a spinner; this component
      // unmounts before the user sees the button again.
      navigate("/");
    }
  };

  return (
    <div class="flex h-full w-full items-center justify-center bg-background">
      <div class="w-full max-w-sm rounded-xl bg-card p-8 shadow-lg">
        <h1 class="mb-6 text-xl font-bold text-text-primary">
          Sign in to Haven
        </h1>

        <form onSubmit={submit} class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-text-secondary">Email</label>
            <input
              type="email"
              autocomplete="username"
              required
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              class="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-text-secondary">
              Password
            </label>
            <input
              type="password"
              autocomplete="current-password"
              required
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              class="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <Show when={error()}>
            <p class="text-sm text-destructive">{error()}</p>
          </Show>

          <button
            type="submit"
            disabled={busy()}
            class="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy() ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
