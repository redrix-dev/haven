import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";
import { getTheme, resolveTheme, themes } from "@shared/themes/registry";
import { featureFlagsToEntitlementKeys } from "@shared/themes/themeEntitlements";
import { readSessionStoredThemeId } from "@shared/themes/sessionThemeStorage";
import type { HavenTheme } from "@shared/themes/types";

export function getRequestedShellThemeId(
  profileThemeId: string | null,
  userId: string | null | undefined,
): string {
  if (!userId) {
    return readSessionStoredThemeId() ?? "default";
  }
  if (profileThemeId !== null) {
    return getTheme(profileThemeId).id;
  }
  return readSessionStoredThemeId() ?? "default";
}

/** Resolved theme after entitlement checks — matches shell CSS. */
export function computeEffectiveShellTheme(input: {
  profileThemeId: string | null;
  featureFlags: FeatureFlagsSnapshot;
  featureFlagsLoaded: boolean;
  userId: string | null | undefined;
}): HavenTheme {
  const requestedId = getRequestedShellThemeId(
    input.profileThemeId,
    input.userId,
  );
  const allowedEntitlements = input.featureFlagsLoaded
    ? featureFlagsToEntitlementKeys(input.featureFlags)
    : [];
  return resolveTheme(themes, {
    selectedThemeId: getTheme(requestedId).id,
    allowedEntitlements,
    fallbackThemeId: "default",
  });
}
