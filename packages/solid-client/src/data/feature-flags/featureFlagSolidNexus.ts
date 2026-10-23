import { createMemo, type Accessor } from "solid-js";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";
import {
  FeatureFlagNexus,
  createInitialFeatureFlagState,
  type FeatureFlagControlPlane,
  type FeatureFlagState,
} from "@shared/nexus/feature-flags/featureFlagNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared FeatureFlagNexus. */
export class FeatureFlagSolidNexus extends FeatureFlagNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: FeatureFlagState;

  constructor(controlPlane: FeatureFlagControlPlane) {
    const port = createSolidStatePort(createInitialFeatureFlagState());
    super(port, controlPlane);
    this.state = port.tracked;
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
}
