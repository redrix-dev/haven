import type { OnboardingCampaign } from "@shared/lib/backend/types";

export const campaignsEqual = (
  a: OnboardingCampaign[],
  b: OnboardingCampaign[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (
      left.key !== right.key ||
      left.featureFlagKey !== right.featureFlagKey ||
      left.title !== right.title ||
      left.description !== right.description ||
      left.required !== right.required ||
      left.targetCommunityId !== right.targetCommunityId ||
      left.targetFlairKey !== right.targetFlairKey ||
      left.platformScope !== right.platformScope ||
      left.distributionScope !== right.distributionScope ||
      left.sortOrder !== right.sortOrder
    ) {
      return false;
    }
  }
  return true;
};
