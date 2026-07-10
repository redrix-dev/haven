import { Show, createSignal } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { Button, TextField } from "@solid-client/components/ui";
import { validatePasswordConfirmation } from "@shared/features/auth/domain/policies";
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
} from "@shared/infrastructure/platform/urls";

/** Create an account. On success Supabase emails a confirmation link. */
export function SignUpScreen() {
  const { signUp } = useSession();
  const navigate = useNavigate();

  const [email, setEmail] = createSignal("");
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [acceptedLegal, setAcceptedLegal] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    const match = validatePasswordConfirmation(password(), confirm());
    if (!match.ok) {
      setError(match.error);
      return;
    }
    if (password().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    const result = await signUp({
      email: email(),
      password: password(),
      username: username(),
      acceptedLegal: acceptedLegal(),
    });
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
                We sent a confirmation link to{" "}
                <span class="text-foreground">{email()}</span>. Open it to
                finish creating your account, then sign in.
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
          <h1 class="mb-6 text-xl font-bold text-foreground">
            Create your account
          </h1>

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
            <TextField
              label="Username"
              autocomplete="username"
              required
              value={username()}
              onChange={setUsername}
              placeholder="yourname"
            />
            <TextField
              label="Password"
              type="password"
              autocomplete="new-password"
              required
              value={password()}
              onChange={setPassword}
              placeholder="At least 8 characters"
            />
            <TextField
              label="Confirm password"
              type="password"
              autocomplete="new-password"
              required
              value={confirm()}
              onChange={setConfirm}
              placeholder="••••••••"
            />

            <label class="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptedLegal()}
                onChange={(ev) => setAcceptedLegal(ev.currentTarget.checked)}
                class="mt-0.5"
              />
              <span>
                I agree to the{" "}
                <a
                  href={HAVEN_TERMS_URL}
                  target="_blank"
                  rel="noreferrer"
                  class="text-primary hover:underline"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href={HAVEN_PRIVACY_URL}
                  target="_blank"
                  rel="noreferrer"
                  class="text-primary hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <Show when={error()}>
              <p class="text-sm text-destructive">{error()}</p>
            </Show>

            <Button type="submit" disabled={busy()} class="mt-2">
              {busy() ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/sign-in")}
              class="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        </Show>
      </div>
    </div>
  );
}
