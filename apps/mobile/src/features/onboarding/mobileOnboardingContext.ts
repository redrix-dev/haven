import Constants from "expo-constants";
import { Platform } from "react-native";
import type { OnboardingContext } from "@shared/lib/backend/people";

/** Where the app runs, which decides the introductions offered. */
export function getMobileOnboardingContext(): OnboardingContext {
  const platform =
    Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "all";
  return {
    platform,
    distribution: "all",
    app_version: Constants.expoConfig?.version ?? null,
  };
}
