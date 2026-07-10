import { createStore, type SetStoreFunction } from "solid-js/store";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  OnboardingCampaign,
  OnboardingClientContext,
  OnboardingCompletionResult,
} from "@shared/lib/backend/types";

/**
 * Onboarding-campaign nexus (parity with mobile's OnboardingNexus). The server
 * returns the campaigns this user hasn't completed yet (scoped by platform /
 * distribution); the onboarding gate shows them one at a time and completes
 * each. Holds a Solid store directly — the gate reads `state.*` reactively.
 */
type OnboardingControlPlane = Pick<
  ControlPlaneBackend,
  "listMyOnboardingCampaigns" | "completeOnboardingCampaign"
>;

export type OnboardingSolidState = {
  campaigns: OnboardingCampaign[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  completingCampaignKey: string | null;
  completionError: string | null;
};

const initialState = (): OnboardingSolidState => ({
  campaigns: [],
  loaded: false,
  loading: false,
  error: null,
  completingCampaignKey: null,
  completionError: null,
});

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

export class OnboardingSolidNexus {
  readonly state: OnboardingSolidState;
  private readonly setState: SetStoreFunction<OnboardingSolidState>;
  private loadInflight: Promise<OnboardingCampaign[]> | null = null;

  constructor(private readonly controlPlane: OnboardingControlPlane) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  async load(context: OnboardingClientContext): Promise<OnboardingCampaign[]> {
    if (this.loadInflight) return this.loadInflight;

    const promise = (async () => {
      this.setState({ loading: true, error: null });
      try {
        const campaigns =
          await this.controlPlane.listMyOnboardingCampaigns(context);
        this.setState({ campaigns, loaded: true, loading: false, error: null });
        return campaigns;
      } catch (error) {
        this.setState({
          campaigns: [],
          loaded: true,
          loading: false,
          error: errorMessage(error, "Failed to load onboarding."),
        });
        throw error;
      }
    })().finally(() => {
      this.loadInflight = null;
    });

    this.loadInflight = promise;
    return promise;
  }

  async complete(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    this.setState({
      completingCampaignKey: campaignKey,
      completionError: null,
    });
    try {
      const result = await this.controlPlane.completeOnboardingCampaign(
        campaignKey,
        context,
      );
      this.setState("campaigns", (campaigns) =>
        campaigns.filter((campaign) => campaign.key !== campaignKey),
      );
      this.setState({ completingCampaignKey: null, completionError: null });
      return result;
    } catch (error) {
      this.setState({
        completingCampaignKey: null,
        completionError: errorMessage(error, "Failed to complete onboarding."),
      });
      throw error;
    }
  }

  reset(): void {
    this.loadInflight = null;
    this.setState(initialState());
  }
}

export function createOnboardingSolidNexus(
  controlPlane: OnboardingControlPlane,
): OnboardingSolidNexus {
  return new OnboardingSolidNexus(controlPlane);
}
