import { useEffect } from "react";
import { useStore } from "@mobile-data";
import { getTheme } from "@shared/themes/registry";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

/**
 * Follows the account's theme (`user_settings.theme`, which the device keeps
 * between launches) into the mobile theme store.
 */
export function useHydrateMobileThemeFromProfile() {
  const theme = useStore("account", (s) => s.settings?.theme ?? null);
  useEffect(() => {
    if (!theme) return;
    useMobileThemePreferenceStore
      .getState()
      .setSelectedThemeId(getTheme(theme).id);
  }, [theme]);
}
