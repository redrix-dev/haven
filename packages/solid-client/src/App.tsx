import { Show } from "solid-js";
import type { HavenBridge } from "./bridge";
import { createSessionController } from "./sessionController";
import { DevLogin, SessionPanel } from "./components/DevLogin";
import "./styles.css";

/**
 * Haven Solid shell. Currently a disposable auth + bootstrap harness: sign in
 * with a real account, watch HavenSolidCore march through its bootstrap phases
 * and populate the caches. No real UI yet — that's Phase 3.
 *
 * The optional `bridge` is injected by the host (Tauri shell, or nothing in a
 * plain browser).
 */
export function App(_props: { bridge?: HavenBridge }) {
  const { session, phase, signIn, signOut } = createSessionController();

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
