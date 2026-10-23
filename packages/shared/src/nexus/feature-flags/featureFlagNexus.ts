import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";
import { messageFromError } from "../kit/errors";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type FeatureFlagControlPlane = Pick<
  ControlPlaneBackend,
  "listMyFeatureFlags"
>;

export type FeatureFlagState = {
  flags: FeatureFlagsSnapshot;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export const createInitialFeatureFlagState = (): FeatureFlagState => ({
  flags: {},
  loaded: false,
  loading: false,
  error: null,
});

/** The viewer's feature flags — a snapshot loaded once per session. */
export class FeatureFlagNexus {
  private readonly gate = createLoadGate();

  constructor(
    protected readonly port: StatePort<FeatureFlagState>,
    private readonly controlPlane: FeatureFlagControlPlane,
  ) {}

  load(): Promise<FeatureFlagsSnapshot> {
    return this.gate.run("load", async (stale) => {
      this.port.set({ loading: true, error: null });
      try {
        const flags = await this.controlPlane.listMyFeatureFlags();
        if (stale()) return flags;
        this.port.set({ flags, loaded: true, loading: false, error: null });
        return flags;
      } catch (error) {
        if (stale()) throw error;
        this.port.set({
          flags: {},
          loaded: true,
          loading: false,
          error: messageFromError(error, "Failed to load feature flags."),
        });
        throw error;
      }
    });
  }

  reset(): void {
    this.gate.clear();
    this.port.set(createInitialFeatureFlagState());
  }

  has(flagKey: string): boolean {
    return Boolean(this.port.get().flags[flagKey]);
  }

  getFlags(): FeatureFlagsSnapshot {
    return this.port.get().flags;
  }

  getLoaded(): boolean {
    return this.port.get().loaded;
  }

  getLoading(): boolean {
    return this.port.get().loading;
  }

  getError(): string | null {
    return this.port.get().error;
  }
}
