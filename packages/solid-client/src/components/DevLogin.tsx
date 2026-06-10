import { createSignal, Show } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import { useSession } from "../contexts/SessionProvider";

/**
 * The whole disposable dev-harness screen, registered at "/" in routes/ until
 * the real playground feature lands (docs/SOLID_REBUILD.md § current phase,
 * step 3). Auth form + signed-in panel + theme probe — all of it dies together.
 */
export function DevHarness() {
  const { session, phase, signIn, signOut } = useSession();

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <ThemeProbe />
      <Show when={session()} fallback={<DevLogin onSubmit={signIn} />}>
        {(active) => (
          <SessionPanel session={active()} phase={phase} onSignOut={signOut} />
        )}
      </Show>
    </div>
  );
}

/**
 * Throwaway login form for wiring/diagnostics only. No styling polish, no
 * sign-up, no recovery — just enough to get a real session so we can watch the
 * cache machine bootstrap. Delete when the real Phase 3 auth UI lands.
 */
export function DevLogin(props: {
  onSubmit: (email: string, password: string) => Promise<{ error: unknown }>;
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
        signInError instanceof Error
          ? signInError.message
          : String(signInError),
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
    <div
      style={{
        padding: "24px",
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
      }}
    >
      <div style={{ "font-weight": "700", "font-size": "16px" }}>
        Signed in as {props.session.user?.email ?? props.session.user?.id}
      </div>
      <div>
        bootstrap phase: <strong>{props.phase().phase}</strong>
      </div>
      <Show when={props.phase().error}>
        <div style={{ color: "var(--accent)" }}>
          error: {props.phase().error}
        </div>
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

/**
 * TEMPORARY theme-wiring probe — delete once the theme is confirmed
 * (docs/SOLID_REBUILD.md § current phase, step 1).
 *
 * Two INDEPENDENT rows so you can tell bad wiring from broken wiring:
 *
 *   Row 1 "raw CSS vars" — inline `background: var(--token)`. These light up the
 *   moment `globals.css` is actually loaded, with NO Tailwind involvement.
 *   Row 2 "tailwind utilities" — `class="bg-*"`. These need Tailwind to be
 *   processing utilities against the theme.
 *
 * Read the result:
 *   • Both rows colored      → fully wired. Delete this block.
 *   • Both rows uncolored    → globals.css isn't loading. Check the
 *     `@shared/styles/globals.css` import + the `@shared` alias in the vite config.
 *   • Row 1 colored, Row 2 not → CSS loads but Tailwind isn't generating utilities.
 *     Check `@tailwindcss/vite` is in the plugins array, then content detection
 *     (the `@source` note in SOLID_REBUILD step 1).
 */
function ThemeProbe() {
  const swatch = {
    width: "130px",
    height: "60px",
    display: "grid",
    "place-items": "center",
    border: "1px solid rgba(255,255,255,0.25)",
    "border-radius": "6px",
    color: "#fff",
    "font-size": "11px",
  } as const;

  const rawVars = ["--surface-1", "--surface-4", "--primary", "--text-primary"];
  const utilities = [
    "bg-background",
    "bg-card",
    "bg-primary",
    "bg-surface-panel",
  ];

  return (
    <div
      style={{
        padding: "16px",
        "font-family": "ui-monospace, monospace",
        color: "#fff",
        background: "#000",
      }}
    >
      <div style={{ "margin-bottom": "10px", "font-weight": "700" }}>
        THEME PROBE — delete once wired
      </div>

      <div style={{ "margin-bottom": "4px", color: "#9aa" }}>
        row 1 · raw CSS vars (is globals.css loaded?)
      </div>
      <div style={{ display: "flex", gap: "8px", "margin-bottom": "14px" }}>
        {rawVars.map((v) => (
          <div style={{ ...swatch, background: `var(${v})` }}>{v}</div>
        ))}
      </div>

      <div style={{ "margin-bottom": "4px", color: "#9aa" }}>
        row 2 · tailwind utilities (is Tailwind processing the theme?)
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {utilities.map((c) => (
          <div class={c} style={swatch}>
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
