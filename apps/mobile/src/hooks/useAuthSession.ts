import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { dataCacheDebug } from "@shared/debug";
import { getMobileSupabase } from "../supabase/getMobileSupabase";
import { clearAllChannelScrollExits } from "../storage/communityTimelinePrefs";
import { clearCrossSessionCommunityWorkspaceCaches } from "@shared/features/community/hooks/useCommunityWorkspace";
import { clearCrossSessionMessagingCaches } from "@shared/features/messaging/hooks/useMessages";
import { useAuthStore } from "@shared/stores/authStore";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

/** `undefined` while hydrating from AsyncStorage; `null` when signed out. */
export function useAuthSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getMobileSupabase();
      useAuthStore.getState().setIsLoading(true);

      void supabase.auth.getSession().then(({ data }) => {
        const nextSession = data.session ?? null;
        if (!nextSession?.user) {
          dataCacheDebug.lifecycle("useAuthSession", "signed out — clear caches");
          useMessagesStore.getState().reset();
          clearCrossSessionMessagingCaches();
          clearCrossSessionCommunityWorkspaceCaches();
          clearAllChannelScrollExits();
          useMobileThemePreferenceStore.getState().resetToDefault();
        }
        setSession(nextSession);
        useAuthStore.getState().setSession(nextSession);
        useAuthStore.getState().setUser(nextSession?.user ?? null);
        useAuthStore.getState().setIsLoading(false);
      });

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, next) => {
        const prevUserId = useAuthStore.getState().user?.id ?? null;
        const nextUserId = next?.user?.id ?? null;
        if (!nextUserId) {
          dataCacheDebug.lifecycle("useAuthSession", "auth change — signed out");
          useMessagesStore.getState().reset();
          clearCrossSessionMessagingCaches();
          clearCrossSessionCommunityWorkspaceCaches();
          clearAllChannelScrollExits();
          useMobileThemePreferenceStore.getState().resetToDefault();
        } else if (prevUserId && prevUserId !== nextUserId) {
          dataCacheDebug.lifecycle("useAuthSession", "auth change — account switch", {
            prevUserId,
            nextUserId,
          });
          useMessagesStore.getState().reset();
          clearCrossSessionMessagingCaches();
          clearCrossSessionCommunityWorkspaceCaches();
          clearAllChannelScrollExits();
          useMobileThemePreferenceStore.getState().resetToDefault();
        }
        setSession(next);
        useAuthStore.getState().setSession(next);
        useAuthStore.getState().setUser(next?.user ?? null);
        useAuthStore.getState().setIsLoading(false);
      });
      subscription = sub;
    } catch {
      setSession(null);
      useAuthStore.getState().setSession(null);
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setIsLoading(false);
    }

    return () => subscription?.unsubscribe();
  }, []);

  return session;
}
