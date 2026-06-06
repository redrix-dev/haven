import { useHavenCore } from "@shared/core";
import { Asset } from "expo-asset";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getMobileOnboardingContext } from "@/features/onboarding/mobileOnboardingContext";
import { MOBILE_ONBOARDING_ASSETS } from "@/features/onboarding/mobileOnboardingCards";
import { MobileOnboardingScreen } from "@/screens/onboarding/MobileOnboardingScreen";

type MobileOnboardingGateProps = {
  children: ReactNode;
};

export function MobileOnboardingGate({ children }: MobileOnboardingGateProps) {
  const core = useHavenCore();
  const context = useMemo(() => getMobileOnboardingContext(), []);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const campaigns = core.onboarding.useCampaigns();
  const loaded = core.onboarding.useLoaded();
  const loading = core.onboarding.useLoading();
  const error = core.onboarding.useError();
  const completingCampaignKey = core.onboarding.useCompletingCampaignKey();
  const completionError = core.onboarding.useCompletionError();

  const loadCampaigns = useCallback(() => {
    void core.onboarding.load(context).catch((loadError) => {
      console.warn("[MobileOnboardingGate] load failed", loadError);
    });
  }, [context, core]);

  useEffect(() => {
    let cancelled = false;
    void Asset.loadAsync(MOBILE_ONBOARDING_ASSETS)
      .catch((assetError) => {
        console.warn("[MobileOnboardingGate] asset preload failed", assetError);
      })
      .finally(() => {
        if (!cancelled) setAssetsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const campaign = campaigns[0] ?? null;

  const completeCampaign = useCallback(() => {
    if (!campaign) return;
    void core.completeOnboardingCampaign(campaign.key, context).catch((completeError) => {
      console.warn("[MobileOnboardingGate] completion failed", completeError);
    });
  }, [campaign, context, core]);

  if (!loaded || loading || !assetsLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; matches foreground */}
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-3 text-center text-xl font-semibold text-foreground">
          Onboarding could not load
        </Text>
        <Text className="mb-6 text-center text-sm leading-6 text-muted-foreground">
          {error}
        </Text>
        <Pressable className="rounded-xl bg-primary px-6 py-3" onPress={loadCampaigns}>
          <Text className="text-base font-semibold text-primary-foreground">
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!campaign) {
    return <>{children}</>;
  }

  return (
    <MobileOnboardingScreen
      campaign={campaign}
      completing={completingCampaignKey === campaign.key}
      error={completionError}
      onComplete={completeCampaign}
    />
  );
}
