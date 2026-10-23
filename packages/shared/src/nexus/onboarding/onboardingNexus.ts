import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  OnboardingCampaign,
  OnboardingClientContext,
  OnboardingCompletionResult,
} from "@shared/lib/backend/types";
import { messageFromError } from "../kit/errors";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type OnboardingControlPlane = Pick<
  ControlPlaneBackend,
  "listMyOnboardingCampaigns" | "completeOnboardingCampaign"
>;

export type OnboardingState = {
  campaigns: OnboardingCampaign[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  completingCampaignKey: string | null;
  completionError: string | null;
};

export const createInitialOnboardingState = (): OnboardingState => ({
  campaigns: [],
  loaded: false,
  loading: false,
  error: null,
  completingCampaignKey: null,
  completionError: null,
});

/**
 * Onboarding campaigns the viewer hasn't completed yet (scoped by platform and
 * distribution). The onboarding gate shows them one at a time and completes
 * each.
 */
export class OnboardingNexus {
  private readonly gate = createLoadGate();

  constructor(
    protected readonly port: StatePort<OnboardingState>,
    private readonly controlPlane: OnboardingControlPlane,
  ) {}

  load(context: OnboardingClientContext): Promise<OnboardingCampaign[]> {
    return this.gate.run("load", async (stale) => {
      this.port.set({ loading: true, error: null });
      try {
        const campaigns =
          await this.controlPlane.listMyOnboardingCampaigns(context);
        if (stale()) return campaigns;
        this.port.set({ campaigns, loaded: true, loading: false, error: null });
        return campaigns;
      } catch (error) {
        if (stale()) throw error;
        this.port.set({
          campaigns: [],
          loaded: true,
          loading: false,
          error: messageFromError(error, "Failed to load onboarding."),
        });
        throw error;
      }
    });
  }

  async complete(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    this.port.set({
      completingCampaignKey: campaignKey,
      completionError: null,
    });
    try {
      const result = await this.controlPlane.completeOnboardingCampaign(
        campaignKey,
        context,
      );
      this.port.set({
        campaigns: this.port
          .get()
          .campaigns.filter((campaign) => campaign.key !== campaignKey),
        completingCampaignKey: null,
        completionError: null,
      });
      return result;
    } catch (error) {
      this.port.set({
        completingCampaignKey: null,
        completionError: messageFromError(
          error,
          "Failed to complete onboarding.",
        ),
      });
      throw error;
    }
  }

  reset(): void {
    this.gate.clear();
    this.port.set(createInitialOnboardingState());
  }

  getCampaigns(): OnboardingCampaign[] {
    return this.port.get().campaigns;
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

  getCompletingCampaignKey(): string | null {
    return this.port.get().completingCampaignKey;
  }

  getCompletionError(): string | null {
    return this.port.get().completionError;
  }
}
