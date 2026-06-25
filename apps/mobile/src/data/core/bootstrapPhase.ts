/**
 * Lifecycle phases reported by HavenCore during bootstrap.
 *
 *   idle               — no session
 *   rehydrating        — restoring nexuses from persistence
 *   loading_communities — initial HTTP load of user communities
 *   connecting_realtime — subscribing to the private user channel
 *   ready              — session is live
 *   error              — bootstrap failed (see lastError)
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

/**
 * Minimal observable so the UI can subscribe to bootstrap progress
 * without dragging in Zustand or React in core.
 */
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
