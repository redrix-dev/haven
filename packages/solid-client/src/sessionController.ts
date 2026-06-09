import { createSignal, onCleanup } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import {
  requireHavenSolidCore,
  type BootstrapPhaseSnapshot,
} from "@solid-client/core";

/**
 * Disposable dev session controller — the Solid counterpart to mobile's
 * `useAuthSession`. It does the one job auth has in this architecture: watch
 * Supabase session state and hand the user id off to the cache machine
 * (`bootstrapSession` / `clearSession`). Everything downstream (loading
 * communities, realtime, etc.) lives inside HavenSolidCore.
 *
 * Returns reactive `session` + `phase` signals plus `signIn`/`signOut` actions
 * for the throwaway login UI. Replace with a real auth layer in Phase 3.
 */
export function createSessionController() {
  const core = requireHavenSolidCore();
  const supabase = core.backends.client;

  const [session, setSession] = createSignal<Session | null | undefined>(
    undefined,
  );
  const [phase, setPhase] = createSignal<BootstrapPhaseSnapshot>(
    core.getBootstrapPhase(),
  );

  // Mirror the core's bootstrap phase into a signal so the UI repaints as the
  // session marches idle → … → ready, and log every transition for the console.
  const unsubscribePhase = core.subscribeBootstrapPhase((snapshot) => {
    setPhase(snapshot);
    console.log("[session] phase →", snapshot.phase, snapshot.error ?? "");
  });
  onCleanup(unsubscribePhase);

  // Dedupe: Supabase fires getSession + INITIAL_SESSION + SIGNED_IN, all with
  // the same user. Only bootstrap once per distinct user id.
  let activeUserId: string | null = null;

  const applySignIn = (userId: string) => {
    if (activeUserId === userId) return;
    activeUserId = userId;
    void core.bootstrapSession(userId).catch((err) => {
      console.warn("[session] bootstrapSession failed", err);
    });
  };

  const applySignOut = () => {
    activeUserId = null;
    void core.clearSession();
  };

  // Single place that reconciles a Supabase session into our signals, the
  // core's auth store, and the cache lifecycle.
  const sync = (next: Session | null) => {
    setSession(next);
    const auth = core.authStore.getState();
    auth.setSession(next);
    auth.setUser(next?.user ?? null);
    auth.setIsLoading(false);

    const userId = next?.user?.id ?? null;
    if (userId) applySignIn(userId);
    else applySignOut();
  };

  void supabase.auth.getSession().then(({ data }) => {
    sync(data.session ?? null);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, next) => {
    sync(next ?? null);
  });
  onCleanup(() => subscription.unsubscribe());

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  return { session, phase, signIn, signOut };
}
