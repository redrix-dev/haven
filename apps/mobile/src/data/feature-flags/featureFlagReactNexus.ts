import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  FeatureFlagNexus,
  createInitialFeatureFlagState,
  type FeatureFlagControlPlane,
  type FeatureFlagState,
} from "@shared/nexus/feature-flags/featureFlagNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared FeatureFlagNexus: the store the hooks read. */
export class FeatureFlagReactNexus extends FeatureFlagNexus {
  readonly reactiveStore: ReadableStore<FeatureFlagState>;

  constructor(controlPlane: FeatureFlagControlPlane) {
    const port = createZustandStatePort(createInitialFeatureFlagState());
    super(port, controlPlane);
    this.reactiveStore = port.store;
  }
}
