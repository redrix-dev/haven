import type { OnboardingReactNexus } from "../onboarding/onboardingReactNexus";
import type { OnboardingCampaign } from "@shared/lib/backend/types";
import { campaignsEqual } from "@shared/features/onboarding/logic/equality";
import { useStoreSelector } from "./useStoreSelector";

export function useCampaigns(
  nexus: OnboardingReactNexus,
): OnboardingCampaign[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.campaigns,
    campaignsEqual,
  );
}

export function useLoaded(nexus: OnboardingReactNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.loaded);
}

export function useLoading(nexus: OnboardingReactNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) => state.loading);
}

export function useError(nexus: OnboardingReactNexus): string | null {
  return useStoreSelector(nexus.reactiveStore, (state) => state.error);
}

export function useCompletingCampaignKey(
  nexus: OnboardingReactNexus,
): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.completingCampaignKey,
  );
}

export function useCompletionError(nexus: OnboardingReactNexus): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.completionError,
  );
}
