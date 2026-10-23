/**
 * Lifecycle phases HavenCore reports during bootstrap.
 *
 *   idle                 — no session
 *   rehydrating          — restoring nexuses from persistence
 *   loading_communities  — first load of the user's communities and permissions
 *   loading_session_data — DMs, notifications, social, flags, viewer profile
 *   connecting_realtime  — subscribing to the private user channel
 *   ready                — session is live
 *   error                — bootstrap failed (see `error`)
 */
export type BootstrapPhaseValue =
  | "idle"
  | "rehydrating"
  | "loading_communities"
  | "loading_session_data"
  | "connecting_realtime"
  | "ready"
  | "error";

export type BootstrapPhaseSnapshot = {
  phase: BootstrapPhaseValue;
  error: string | null;
};

export type BootstrapPhaseListener = (snapshot: BootstrapPhaseSnapshot) => void;

/** A framework-free observable so the UI can follow bootstrap progress. */
export class BootstrapPhase {
  private snapshot: BootstrapPhaseSnapshot = { phase: "idle", error: null };
  private listeners = new Set<BootstrapPhaseListener>();

  get(): BootstrapPhaseSnapshot {
    return this.snapshot;
  }

  set(phase: BootstrapPhaseValue, error: string | null = null): void {
    const next: BootstrapPhaseSnapshot = { phase, error };
    if (
      next.phase === this.snapshot.phase &&
      next.error === this.snapshot.error
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (err) {
        console.warn("[BootstrapPhase] listener failed", err);
      }
    }
  }

  subscribe(listener: BootstrapPhaseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
