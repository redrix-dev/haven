import { Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { Button, TextField } from "@solid-client/components/ui";

/** Request a password-reset email. Always reports success (no account enumeration). */
export function ForgotPasswordScreen() {
  const { requestPasswordReset } = useSession();

  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await requestPasswordReset(email());
    setBusy(false);
    if (result.error) {
      setError(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }
    setSent(true);
  };

  return (
    <div class="flex h-full w-full items-center justify-center bg-background">
      <div class="w-full max-w-sm rounded-xl bg-card p-8 shadow-lg">
        <Show
          when={!sent()}
          fallback={
            <div class="space-y-4">
              <h1 class="text-xl font-bold text-foreground">
                Check your email
              </h1>
              <p class="text-sm text-muted-foreground">
                If an account exists for{" "}
                <span class="text-foreground">{email()}</span>, a password-reset
                link is on its way. Open it to set a new password.
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
          <h1 class="mb-2 text-xl font-bold text-foreground">
            Reset your password
          </h1>
          <p class="mb-6 text-sm text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </p>

          <form onSubmit={submit} class="flex flex-col gap-4">
            <TextField
              label="Email"
              type="email"
              autocomplete="email"
              required
              value={email()}
              onChange={setEmail}
              placeholder="you@example.com"
            />

            <Show when={error()}>
              <p class="text-sm text-destructive">{error()}</p>
            </Show>

            <Button type="submit" disabled={busy()} class="mt-2">
              {busy() ? "Sending…" : "Send reset link"}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            <A href="/sign-in" class="font-medium text-primary hover:underline">
              Back to sign in
            </A>
          </p>
        </Show>
      </div>
    </div>
  );
}
