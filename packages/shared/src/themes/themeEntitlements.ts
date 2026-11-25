import type { FeatureFlag } from "@shared/lib/backend/records";

/** Enabled feature-flag keys are treated as entitlement keys for `resolveTheme`. */
export function featureFlagsToEntitlementKeys(
  flags: readonly FeatureFlag[],
): string[] {
  return flags.filter((flag) => flag.enabled).map((flag) => flag.key);
}
