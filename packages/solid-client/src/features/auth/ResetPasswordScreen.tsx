import { Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useSession } from "@solid-client/contexts/SessionProvider";
import { Button, TextField } from "@solid-client/components/ui";
import { validateRecoveryPassword } from "@shared/features/auth/domain/policies";

/**
 * Set a new password during an active recovery session. Shown by AppLayout when
 * `passwordRecoveryRequired` is set (the recovery email link established a
 * short-lived session). On success the gate clears and the app renders.
 */
export function ResetPasswordScreen() {
  const { updateRecoveryPassword, signOut } = useSession();
  const navigate = useNavigate();

  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    const check = validateRecoveryPassword(password(), confirm());
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);
    const result = await updateRecoveryPassword(password());
    setBusy(false);
    if (result.error) {
      setError(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div class="flex h-full w-full items-center justify-center bg-background">
      <div class="w-full max-w-sm rounded-xl bg-card p-8 shadow-lg">
        <h1 class="mb-2 text-xl font-bold text-foreground">
          Set a new password
        </h1>
        <p class="mb-6 text-sm text-muted-foreground">
          Choose a new password for your account.
        </p>

        <form onSubmit={submit} class="flex flex-col gap-4">
          <TextField
            label="New password"
            type="password"
            autocomplete="new-password"
            required
            value={password()}
            onChange={setPassword}
            placeholder="At least 8 characters"
          />
          <TextField
            label="Confirm new password"
            type="password"
            autocomplete="new-password"
            required
            value={confirm()}
            onChange={setConfirm}
            placeholder="••••••••"
          />

          <Show when={error()}>
            <p class="text-sm text-destructive">{error()}</p>
          </Show>

          <Button type="submit" disabled={busy()} class="mt-2">
            {busy() ? "Saving…" : "Update password"}
          </Button>
        </form>

        <p class="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => void signOut()}
            class="font-medium text-primary hover:underline"
          >
            Cancel and sign out
          </button>
        </p>
      </div>
    </div>
  );
}
