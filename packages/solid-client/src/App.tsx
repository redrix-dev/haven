import { Show } from "solid-js";
import type { HavenBridge } from "./bridge";
import { SessionProvider, useSession } from "./contexts/SessionProvider";
import { DevLogin, SessionPanel } from "./components/DevLogin";
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
      <Show when={session()} fallback={<DevLogin onSubmit={signIn} />}>
        {(active) => (
          <SessionPanel session={active()} phase={phase} onSignOut={signOut} />
        )}
      </Show>
    </div>
  );
}
