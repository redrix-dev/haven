import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  OnboardingNexus,
  createInitialOnboardingState,
  type OnboardingControlPlane,
  type OnboardingState,
} from "@shared/nexus/onboarding/onboardingNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared OnboardingNexus: the store the hooks read. */
export class OnboardingReactNexus extends OnboardingNexus {
  readonly reactiveStore: ReadableStore<OnboardingState>;

  constructor(controlPlane: OnboardingControlPlane) {
    const port = createZustandStatePort(createInitialOnboardingState());
    super(port, controlPlane);
    this.reactiveStore = port.store;
  }
}
