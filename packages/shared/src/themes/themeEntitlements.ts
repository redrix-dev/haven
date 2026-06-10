import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";

/** Enabled feature-flag keys are treated as entitlement keys for `resolveTheme`. */
export function featureFlagsToEntitlementKeys(
  flags: FeatureFlagsSnapshot,
): string[] {
  return Object.entries(flags)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
}
