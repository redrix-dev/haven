import type { OnboardingNexus } from "../onboarding/OnboardingNexus";
import type { OnboardingCampaign } from "@shared/lib/backend/types";
import { campaignsEqual } from "@shared/features/onboarding/logic/equality";
import { useStoreSelector } from "./useStoreSelector";

export function useCampaigns(nexus: OnboardingNexus): OnboardingCampaign[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => {
      void state.revision;
      return state.campaigns;
    },
    campaignsEqual,
  );
}

export function useLoaded(nexus: OnboardingNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.loaded);
}

export function useLoading(nexus: OnboardingNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.loading);
}

export function useError(nexus: OnboardingNexus): string | null {
  return useStoreSelector(nexus.reactiveStore, (state) => state.error);
}

export function useCompletingCampaignKey(
  nexus: OnboardingNexus,
): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.completingCampaignKey,
  );
}

export function useCompletionError(nexus: OnboardingNexus): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.completionError,
  );
}
