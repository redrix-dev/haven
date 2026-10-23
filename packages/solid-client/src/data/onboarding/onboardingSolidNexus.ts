import {
  OnboardingNexus,
  createInitialOnboardingState,
  type OnboardingControlPlane,
  type OnboardingState,
} from "@shared/nexus/onboarding/onboardingNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

/**
 * Solid read binding over the shared OnboardingNexus. The onboarding gate
 * reads `state.*` directly in its tracking scope.
 */
export class OnboardingSolidNexus extends OnboardingNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: OnboardingState;

  constructor(controlPlane: OnboardingControlPlane) {
    const port = createSolidStatePort(createInitialOnboardingState());
    super(port, controlPlane);
    this.state = port.tracked;
  }
}
