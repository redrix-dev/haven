import { useEffect } from "react";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getTheme } from "@shared/themes/registry";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

/** Loads `profiles.theme` into the mobile theme store when `userId` is present. */
export function useHydrateMobileThemeFromProfile(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void (async () => {
      try {
        const backend = getControlPlaneBackend();
        const profile = await backend.fetchUserProfile(userId);
        if (cancelled) return;
        const id = profile?.theme ? getTheme(profile.theme).id : getTheme("default").id;
        useMobileThemePreferenceStore.getState().setSelectedThemeId(id);
      } catch {
        if (!cancelled) {
          useMobileThemePreferenceStore.getState().resetToDefault();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
