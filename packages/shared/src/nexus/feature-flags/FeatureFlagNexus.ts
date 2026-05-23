import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";
import type { StoreApi, UseBoundStore } from "zustand";

export type FeatureFlagNexusState = {
  flags: FeatureFlagsSnapshot;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  revision: number;
};

const flagsEqual = (
  a: FeatureFlagsSnapshot,
  b: FeatureFlagsSnapshot,
): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

export class FeatureFlagNexus {
  private readonly store: UseBoundStore<StoreApi<FeatureFlagNexusState>>;
  private readonly controlPlane: Pick<ControlPlaneBackend, "listMyFeatureFlags">;
  private loadInflight: Promise<FeatureFlagsSnapshot> | null = null;

  constructor(
    _persistence: NexusPersistence,
    controlPlane: Pick<ControlPlaneBackend, "listMyFeatureFlags">,
  ) {
    void _persistence;
    this.controlPlane = controlPlane;
    this.store = create<FeatureFlagNexusState>()(() => ({
      flags: {},
      loaded: false,
      loading: false,
      error: null,
      revision: 0,
    }));
  }

  async load(): Promise<FeatureFlagsSnapshot> {
    if (this.loadInflight) return this.loadInflight;

    const promise = (async () => {
      this.store.setState((state) => ({
        loading: true,
        error: null,
        revision: state.revision + 1,
      }));

      try {
        const flags = await this.controlPlane.listMyFeatureFlags();
        this.store.setState((state) => ({
          flags,
          loaded: true,
          loading: false,
          error: null,
          revision: state.revision + 1,
        }));
        return flags;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load feature flags.";
        this.store.setState((state) => ({
          flags: {},
          loaded: true,
          loading: false,
          error: message,
          revision: state.revision + 1,
        }));
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
    this.store.setState({
      flags: {},
      loaded: false,
      loading: false,
      error: null,
      revision: 0,
    });
  }

  has(flagKey: string): boolean {
    return Boolean(this.store.getState().flags[flagKey]);
  }

  getFlags(): FeatureFlagsSnapshot {
    return this.store.getState().flags;
  }

  getLoaded(): boolean {
    return this.store.getState().loaded;
  }

  getLoading(): boolean {
    return this.store.getState().loading;
  }

  getError(): string | null {
    return this.store.getState().error;
  }

  useFlags(): FeatureFlagsSnapshot {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        void state.revision;
        return state.flags;
      },
      flagsEqual,
    );
  }

  useLoaded(): boolean {
    return useStoreWithEqualityFn(this.store, (state) => state.loaded);
  }

  useLoading(): boolean {
    return useStoreWithEqualityFn(this.store, (state) => state.loading);
  }

  useError(): string | null {
    return useStoreWithEqualityFn(this.store, (state) => state.error);
  }

  useHasFlag(flagKey: string): boolean {
    return useStoreWithEqualityFn(this.store, (state) =>
      Boolean(state.flags[flagKey]),
    );
  }
}
