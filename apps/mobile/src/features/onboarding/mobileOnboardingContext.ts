import Constants from "expo-constants";
import { Platform } from "react-native";
import type { OnboardingClientContext } from "@shared/lib/backend/types";

export function getMobileOnboardingContext(): OnboardingClientContext {
  const platform =
    Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "all";

  return {
    platform,
    distribution: "all",
    appVersion: Constants.expoConfig?.version ?? null,
  };
}
