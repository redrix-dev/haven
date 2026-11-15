import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { requireHavenCore } from "@mobile-data";
import { perfTrace } from "@shared/debug/perfTrace";
import { getMobileSupabase } from "../supabase/getMobileSupabase";
import { clearAllChannelScrollExits } from "../storage/communityTimelinePrefs";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";
import { signOutFromAuth } from "@/auth/mobileAuthService";

/**
 * The Supabase session: `undefined` while it is read from the device, `null`
 * when signed out.
 *
 * This hook is the auth boundary. It tells the core who signed in
 * (`core.signIn`, which loads everything) and when they signed out
 * (`core.signOut`, which empties everything and removes their device copies),
 * and tells the link pipeline, which holds incoming links until it knows.
 */
export function useAuthSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const core = requireHavenCore();

    // Haven staff restricted the account: end the session and say why.
    core.listen({
      restricted: ({ ends_at }) => {
        Alert.alert(
          "Your account is restricted",
          ends_at
            ? `Haven staff restricted this account until ${new Date(ends_at).toLocaleString()}.`
            : "Haven staff restricted this account.",
        );
        void signOutFromAuth();
      },
    });

    const applySignOut = () => {
      clearAllChannelScrollExits();
      useMobileThemePreferenceStore.getState().resetToDefault();
      // A link opened for the previous account must not open for the next one.
      useMobilePushNavigationStore.getState().setPendingLinkIntent(null);
      activeUserIdRef.current = null;
      core.links.setSession(null);
      core.signOut();
    };

    const applySignIn = (userId: string) => {
      if (activeUserIdRef.current === userId) return;
      if (activeUserIdRef.current) applySignOut();
      perfTrace.markOnce("auth-user");
      activeUserIdRef.current = userId;
      core.links.setSession(userId);
      void core.signIn(userId);
    };

    const apply = (next: Session | null) => {
      const userId = next?.user?.id ?? null;
      if (userId) applySignIn(userId);
      else if (activeUserIdRef.current !== null || core.userId !== null) {
        applySignOut();
      } else {
        core.links.setSession(null);
      }
      setSession(next);
    };

    const sessionSpan = perfTrace.begin("auth-session");
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getMobileSupabase();
      void supabase.auth.getSession().then(({ data }) => {
        sessionSpan.end({ signedIn: data.session ? 1 : 0 });
        apply(data.session ?? null);
        if (!data.session) perfTrace.flushSummary("auth-signed-out");
      });
      subscription = supabase.auth.onAuthStateChange((_event, next) =>
        apply(next),
      ).data.subscription;
    } catch {
      sessionSpan.end({ error: 1 });
      apply(null);
    }

    return () => subscription?.unsubscribe();
  }, []);

  return session;
}
