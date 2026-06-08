import { useEffect } from "react";
import { useHavenCore } from "@mobile-data";
import { useViewerProfile } from "@mobile-data/hooks";
import { getTheme } from "@shared/themes/registry";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

/** Loads `profiles.theme` into the mobile theme store when `userId` is present. */
export function useHydrateMobileThemeFromProfile(userId: string | null | undefined) {
  const core = useHavenCore();
  const viewerProfile = useViewerProfile(core.profiles, userId);

  useEffect(() => {
    if (!userId) return;
    void core.profiles.ensureViewerProfile(userId).catch(() => {
      useMobileThemePreferenceStore.getState().resetToDefault();
    });
  }, [core.profiles, userId]);

  useEffect(() => {
    if (!userId || !viewerProfile) return;
    const id = viewerProfile.theme ? getTheme(viewerProfile.theme).id : getTheme("default").id;
    useMobileThemePreferenceStore.getState().setSelectedThemeId(id);
  }, [userId, viewerProfile]);
}
