import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getMobileSupabase } from "../supabase/getMobileSupabase";
import { useAuthStore } from "@shared/stores/authStore";

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
        setSession(nextSession);
        useAuthStore.getState().setSession(nextSession);
        useAuthStore.getState().setUser(nextSession?.user ?? null);
        useAuthStore.getState().setIsLoading(false);
      });

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, next) => {
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
