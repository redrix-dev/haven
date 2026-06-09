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

/** Framework-free bootstrap phase observable for Solid hosts. */
export class BootstrapPhase {
  private snapshot: BootstrapPhaseSnapshot = { phase: "idle", error: null };
  private listeners = new Set<BootstrapPhaseListener>();

  get(): BootstrapPhaseSnapshot {
    return this.snapshot;
  }

  set(phase: BootstrapPhaseValue, error: string | null = null): void {
    const next: BootstrapPhaseSnapshot = { phase, error };
    if (next.phase === this.snapshot.phase && next.error === this.snapshot.error) {
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
