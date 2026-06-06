import { useEffect } from "react";
import type { FeatureFlagsSnapshot } from "@shared/lib/backend/types";
import {
  computeEffectiveShellTheme,
} from "@shared/themes/computeEffectiveShellTheme";
import { writeSessionStoredThemeId } from "@shared/themes/sessionThemeStorage";
import { applyShellThemeTokens } from "@web-client/shellThemeRegistry";

/**
 * Keeps CSS variables in sync with profile + local cache + feature entitlements (web/electron shell).
 */
export function useShellThemeSync(options: {
  profileThemeId: string | null;
  featureFlags: FeatureFlagsSnapshot;
  featureFlagsLoaded: boolean;
  userId: string | null | undefined;
}): void {
  const { profileThemeId, featureFlags, featureFlagsLoaded, userId } = options;

  useEffect(() => {
    const resolved = computeEffectiveShellTheme({
      profileThemeId,
      featureFlags,
      featureFlagsLoaded,
      userId,
    });
    applyShellThemeTokens(resolved.tokens);
    writeSessionStoredThemeId(resolved.id);
  }, [profileThemeId, featureFlags, featureFlagsLoaded, userId]);
}
