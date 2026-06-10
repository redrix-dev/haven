import { Show } from "solid-js";
import type { HavenBridge } from "./bridge";
import { SessionProvider, useSession } from "./contexts/SessionProvider";
import { DevLogin, SessionPanel } from "./components/DevLogin";
import "./theme.css";
import "./styles.css";

/**
 * Haven Solid shell. Currently a disposable auth + bootstrap harness: sign in
 * with a real account, watch HavenSolidCore march through its bootstrap phases
 * and populate the caches. No real UI yet — that's Phase 3.
 *
 * `App` only plants the session boundary; `AppContent` (and everything deeper)
 * lives inside it and reads auth via `useSession()`.
 */
export function App(_props: { bridge?: HavenBridge }) {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}

function AppContent() {
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
