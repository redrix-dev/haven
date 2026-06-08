import { createStore } from "solid-js/store";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";

export type FeatureFlagSolidState = {
  flags: FeatureFlagsSnapshot;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

/** Solid-native feature flag cache stub for typecheck:solid. */
export class FeatureFlagSolidCache {
  private readonly state: FeatureFlagSolidState;
  private readonly setState: (
    updater: (state: FeatureFlagSolidState) => Partial<FeatureFlagSolidState>,
  ) => void;

  constructor() {
    const [state, setState] = createStore<FeatureFlagSolidState>({
      flags: {},
      loaded: false,
      loading: false,
      error: null,
    });
    this.state = state;
    this.setState = setState as typeof this.setState;
  }

  async load(): Promise<FeatureFlagsSnapshot> {
    throw new Error("FeatureFlagSolidCache.load not implemented yet");
  }

  reset(): void {
    this.setState(() => ({
      flags: {},
      loaded: false,
      loading: false,
      error: null,
    }));
  }

  has(_flagKey: string): boolean {
    return false;
  }

  getFlags(): FeatureFlagsSnapshot {
    return this.state.flags;
  }
}
