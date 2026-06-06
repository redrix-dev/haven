import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { requireHavenCore } from "@shared/core";
import { dataCacheDebug } from "@shared/debug";
import { getMobileSupabase } from "../supabase/getMobileSupabase";
import { clearAllChannelScrollExits } from "../storage/communityTimelinePrefs";
import { useAuthStore } from "@shared/stores/authStore";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

/**
 * `undefined` while hydrating from AsyncStorage; `null` when signed out.
 *
 * Session lifecycle (bootstrap/clear of nexuses, realtime subscription) is
 * delegated to `HavenCore.bootstrapSession` / `clearSession`. This hook only
 * tracks Supabase session state and notifies the core when the user changes.
 */
export function useAuthSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const core = requireHavenCore();
    let subscription: { unsubscribe: () => void } | undefined;

    const applySignOut = () => {
      dataCacheDebug.lifecycle("useAuthSession", "signed out — clear caches");
      clearAllChannelScrollExits();
      useMobileThemePreferenceStore.getState().resetToDefault();
      activeUserIdRef.current = null;
      void core.clearSession();
    };

    const applySignIn = (userId: string) => {
      if (activeUserIdRef.current === userId) return;
      activeUserIdRef.current = userId;
      void core.bootstrapSession(userId).catch((err) => {
        console.warn("[useAuthSession] bootstrapSession failed", err);
      });
    };

    try {
      const supabase = getMobileSupabase();
      useAuthStore.getState().setIsLoading(true);

      void supabase.auth.getSession().then(({ data }) => {
        const nextSession = data.session ?? null;
        const userId = nextSession?.user?.id ?? null;
        if (!userId) {
          applySignOut();
        } else {
          applySignIn(userId);
        }
        setSession(nextSession);
        useAuthStore.getState().setSession(nextSession);
        useAuthStore.getState().setUser(nextSession?.user ?? null);
        useAuthStore.getState().setIsLoading(false);
      });

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, next) => {
        const nextUserId = next?.user?.id ?? null;
        const prevUserId = activeUserIdRef.current;

        if (!nextUserId) {
          applySignOut();
        } else if (prevUserId && prevUserId !== nextUserId) {
          dataCacheDebug.lifecycle(
            "useAuthSession",
            "account switch — clear then bootstrap",
            { prevUserId, nextUserId },
          );
          applySignOut();
          applySignIn(nextUserId);
        } else {
          applySignIn(nextUserId);
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
