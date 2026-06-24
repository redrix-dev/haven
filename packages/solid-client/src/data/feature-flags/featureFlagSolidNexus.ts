import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";

type FeatureFlagControlPlane = Pick<ControlPlaneBackend, "listMyFeatureFlags">;

export type FeatureFlagSolidState = {
  flags: FeatureFlagsSnapshot;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

const initialState = (): FeatureFlagSolidState => ({
  flags: {},
  loaded: false,
  loading: false,
  error: null,
});

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

export class FeatureFlagSolidNexus {
  readonly state: FeatureFlagSolidState;
  private readonly setState: SetStoreFunction<FeatureFlagSolidState>;
  private loadInflight: Promise<FeatureFlagsSnapshot> | null = null;

  constructor(private readonly controlPlane: FeatureFlagControlPlane) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  flags(): Accessor<FeatureFlagsSnapshot> {
    return createMemo(() => this.state.flags);
  }

  loaded(): Accessor<boolean> {
    return createMemo(() => this.state.loaded);
  }

  loading(): Accessor<boolean> {
    return createMemo(() => this.state.loading);
  }

  error(): Accessor<string | null> {
    return createMemo(() => this.state.error);
  }

  async load(): Promise<FeatureFlagsSnapshot> {
    if (this.loadInflight) return this.loadInflight;

    const promise = (async () => {
      this.setState({ loading: true, error: null });
      try {
        const flags = await this.controlPlane.listMyFeatureFlags();
        this.setState({ flags, loaded: true, loading: false, error: null });
        return flags;
      } catch (error) {
        this.setState({
          flags: {},
          loaded: true,
          loading: false,
          error: errorMessage(error, "Failed to load feature flags."),
        });
        throw error;
      }
    })().finally(() => {
      this.loadInflight = null;
    });

    this.loadInflight = promise;
    return promise;
  }

  reset(): void {
    this.loadInflight = null;
    this.setState(initialState());
  }

  has(flagKey: string): boolean {
    return Boolean(this.state.flags[flagKey]);
  }

  getFlags(): FeatureFlagsSnapshot {
    return this.state.flags;
  }
}

export function createFeatureFlagSolidNexus(
  controlPlane: FeatureFlagControlPlane,
): FeatureFlagSolidNexus {
  return new FeatureFlagSolidNexus(controlPlane);
}
