import type { OnboardingClientContext } from "@shared/lib/backend/types";

/**
 * The client context sent with onboarding requests. The server matches campaign
 * platform/distribution scopes against it; campaigns scoped "all" reach every
 * client. (Parity with mobile's getMobileOnboardingContext.)
 */
export function getSolidOnboardingContext(
  isNative: boolean,
): OnboardingClientContext {
  return {
    platform: isNative ? "desktop" : "web",
    distribution: "all",
    appVersion: null,
  };
}
