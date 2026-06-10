import { useMemo } from "react";
import { getTheme } from "@shared/themes";
import type { HavenThemeTokens } from "@shared/themes/types";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

export function useMobileThemeTokens(): HavenThemeTokens {
  const selectedThemeId = useMobileThemePreferenceStore(
    (s) => s.selectedThemeId,
  );
  return useMemo(() => getTheme(selectedThemeId).tokens, [selectedThemeId]);
}
