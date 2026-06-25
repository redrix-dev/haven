import { createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { Button, TextField } from "@solid-client/components/ui";

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
        <h1 class="mb-6 text-xl font-bold text-foreground">Sign in to Haven</h1>

        <form onSubmit={submit} class="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autocomplete="username"
            required
            value={email()}
            onChange={setEmail}
            placeholder="you@example.com"
          />

          <TextField
            label="Password"
            type="password"
            autocomplete="current-password"
            required
            value={password()}
            onChange={setPassword}
            placeholder="••••••••"
          />

          <div class="-mt-1 text-right">
            <A
              href="/forgot-password"
              class="text-sm text-primary hover:underline"
            >
              Forgot password?
            </A>
          </div>

          <Show when={error()}>
            <p class="text-sm text-destructive">{error()}</p>
          </Show>

          <Button type="submit" disabled={busy()} class="mt-2">
            {busy() ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p class="mt-4 text-center text-sm text-muted-foreground">
          New to Haven?{" "}
          <A href="/sign-up" class="font-medium text-primary hover:underline">
            Create an account
          </A>
        </p>
      </div>
    </div>
  );
}
