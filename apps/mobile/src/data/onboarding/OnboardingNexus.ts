import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  OnboardingCampaign,
  OnboardingClientContext,
  OnboardingCompletionResult,
} from "@shared/lib/backend/types";
import { campaignsEqual } from "@shared/features/onboarding/logic/equality";
import type { StoreApi, UseBoundStore } from "zustand";

export type OnboardingNexusState = {
  campaigns: OnboardingCampaign[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  completingCampaignKey: string | null;
  completionError: string | null;
  revision: number;
};

export class OnboardingNexus {
  private readonly store: UseBoundStore<StoreApi<OnboardingNexusState>>;
  private readonly controlPlane: Pick<
    ControlPlaneBackend,
    "listMyOnboardingCampaigns" | "completeOnboardingCampaign"
  >;
  private loadInflight: Promise<OnboardingCampaign[]> | null = null;

  constructor(
    _persistence: NexusPersistence,
    controlPlane: Pick<
      ControlPlaneBackend,
      "listMyOnboardingCampaigns" | "completeOnboardingCampaign"
    >,
  ) {
    void _persistence;
    this.controlPlane = controlPlane;
    this.store = create<OnboardingNexusState>()(() => ({
      campaigns: [],
      loaded: false,
      loading: false,
      error: null,
      completingCampaignKey: null,
      completionError: null,
      revision: 0,
    }));
  }

  async load(context: OnboardingClientContext): Promise<OnboardingCampaign[]> {
    if (this.loadInflight) return this.loadInflight;

    const promise = (async () => {
      this.store.setState((state) => ({
        loading: true,
        error: null,
        revision: state.revision + 1,
      }));

      try {
        const campaigns = await this.controlPlane.listMyOnboardingCampaigns(
          context,
        );
        this.store.setState((state) => ({
          campaigns,
          loaded: true,
          loading: false,
          error: null,
          revision: state.revision + 1,
        }));
        return campaigns;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load onboarding.";
        this.store.setState((state) => ({
          campaigns: [],
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

  async complete(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    this.store.setState((state) => ({
      completingCampaignKey: campaignKey,
      completionError: null,
      revision: state.revision + 1,
    }));

    try {
      const result = await this.controlPlane.completeOnboardingCampaign(
        campaignKey,
        context,
      );
      this.store.setState((state) => ({
        campaigns: state.campaigns.filter(
          (campaign) => campaign.key !== campaignKey,
        ),
        completingCampaignKey: null,
        completionError: null,
        revision: state.revision + 1,
      }));
      return result;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to complete onboarding.";
      this.store.setState((state) => ({
        completingCampaignKey: null,
        completionError: message,
        revision: state.revision + 1,
      }));
      throw error;
    }
  }

  reset(): void {
    this.loadInflight = null;
    this.store.setState({
      campaigns: [],
      loaded: false,
      loading: false,
      error: null,
      completingCampaignKey: null,
      completionError: null,
      revision: 0,
    });
  }

  getCampaigns(): OnboardingCampaign[] {
    return this.store.getState().campaigns;
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

  getCompletingCampaignKey(): string | null {
    return this.store.getState().completingCampaignKey;
  }

  getCompletionError(): string | null {
    return this.store.getState().completionError;
  }

  useCampaigns(): OnboardingCampaign[] {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        void state.revision;
        return state.campaigns;
      },
      campaignsEqual,
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

  useCompletingCampaignKey(): string | null {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.completingCampaignKey,
    );
  }

  useCompletionError(): string | null {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.completionError,
    );
  }
}
