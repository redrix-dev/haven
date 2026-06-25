import { createSignal, onCleanup, createContext, useContext } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import type { JSX } from "solid-js";
import type { Accessor } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import type { BootstrapPhaseSnapshot } from "@solid-client/core";
import {
  SolidAuthResult,
  signInWithPassword,
  signOutFromAuth,
} from "@solid-client/auth/solidAuthService";
type SessionValue = {
  session: Accessor<Session | null | undefined>;
  phase: Accessor<BootstrapPhaseSnapshot>;
  signIn: (email: string, password: string) => Promise<SolidAuthResult>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>();

export function SessionProvider(props: { children: JSX.Element }) {
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

  const signIn = signInWithPassword;
  const signOut = signOutFromAuth;

  const value: SessionValue = { session, phase, signIn, signOut };

  return (
    <SessionContext.Provider value={value}>
      {props.children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
