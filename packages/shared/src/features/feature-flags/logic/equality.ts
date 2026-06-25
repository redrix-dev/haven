import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";

export const flagsEqual = (
  a: FeatureFlagsSnapshot,
  b: FeatureFlagsSnapshot,
): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};
