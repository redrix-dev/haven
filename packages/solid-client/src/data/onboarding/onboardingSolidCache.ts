import { createStore } from "solid-js/store";
import type {
  OnboardingCampaign,
  OnboardingClientContext,
  OnboardingCompletionResult,
} from "@shared/lib/backend/types";

export type OnboardingSolidState = {
  campaigns: OnboardingCampaign[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

/** Solid-native onboarding cache stub for typecheck:solid. */
export class OnboardingSolidCache {
  private readonly state: OnboardingSolidState;

  constructor() {
    const [state] = createStore<OnboardingSolidState>({
      campaigns: [],
      loaded: false,
      loading: false,
      error: null,
    });
    this.state = state;
  }

  async load(_context: OnboardingClientContext): Promise<OnboardingCampaign[]> {
    throw new Error("OnboardingSolidCache.load not implemented yet");
  }

  async complete(
    _campaignKey: string,
    _context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    throw new Error("OnboardingSolidCache.complete not implemented yet");
  }

  reset(): void {
    void this.state;
  }
}
