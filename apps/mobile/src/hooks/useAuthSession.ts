import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getMobileSupabase } from "../supabase/getMobileSupabase";

/** `undefined` while hydrating from AsyncStorage; `null` when signed out. */
export function useAuthSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getMobileSupabase();

      void supabase.auth.getSession().then(({ data }) => {
        setSession(data.session ?? null);
      });

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
      });
      subscription = sub;
    } catch {
      setSession(null);
    }

    return () => subscription?.unsubscribe();
  }, []);

  return session;
}
