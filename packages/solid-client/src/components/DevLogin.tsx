import { createSignal, Show } from "solid-js";
import type { Session } from "@supabase/supabase-js";

/**
 * Throwaway login form for wiring/diagnostics only. No styling polish, no
 * sign-up, no recovery — just enough to get a real session so we can watch the
 * cache machine bootstrap. Delete when the real Phase 3 auth UI lands.
 */
export function DevLogin(props: {
  onSubmit: (
    email: string,
    password: string,
  ) => Promise<{ error: unknown }>;
}) {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await props.onSubmit(email(), password());
    if (signInError) {
      setError(
        signInError instanceof Error ? signInError.message : String(signInError),
      );
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        display: "grid",
        "place-items": "center",
        height: "100%",
        width: "100%",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "10px",
          width: "320px",
          padding: "24px",
          background: "var(--bg-alt)",
          border: "1px solid var(--border)",
          "border-radius": "10px",
        }}
      >
        <div style={{ "font-weight": "700", "font-size": "16px" }}>
          Haven — dev login
        </div>
        <input
          class="ping-input"
          type="email"
          placeholder="email"
          autocomplete="username"
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
        <input
          class="ping-input"
          type="password"
          placeholder="password"
          autocomplete="current-password"
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        <button class="ping-button" type="submit" disabled={busy()}>
          {busy() ? "Signing in…" : "Sign in"}
        </button>
        <Show when={error()}>
          <div style={{ color: "var(--accent)", "font-size": "13px" }}>
            {error()}
          </div>
        </Show>
      </form>
    </div>
  );
}

/** Minimal signed-in panel: shows who's in and the live bootstrap phase. */
export function SessionPanel(props: {
  session: Session;
  phase: () => { phase: string; error: string | null };
  onSignOut: () => void;
}) {
  return (
    <div style={{ padding: "24px", display: "flex", "flex-direction": "column", gap: "8px" }}>
      <div style={{ "font-weight": "700", "font-size": "16px" }}>
        Signed in as {props.session.user?.email ?? props.session.user?.id}
      </div>
      <div>
        bootstrap phase: <strong>{props.phase().phase}</strong>
      </div>
      <Show when={props.phase().error}>
        <div style={{ color: "var(--accent)" }}>error: {props.phase().error}</div>
      </Show>
      <div style={{ "font-size": "12px", color: "var(--text-dim)" }}>
        Inspect caches in the console via <code>__haven</code> (e.g.{" "}
        <code>__haven.communities.getCommunityIds()</code>).
      </div>
      <button
        class="ping-button"
        style={{ "align-self": "flex-start", "margin-top": "8px" }}
        onClick={props.onSignOut}
      >
        Sign out
      </button>
    </div>
  );
}
