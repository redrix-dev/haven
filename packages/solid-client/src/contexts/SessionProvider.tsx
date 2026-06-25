import { createSignal, onCleanup, createContext, useContext } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import type { JSX } from "solid-js";
import type { Accessor } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import type { BootstrapPhaseSnapshot } from "@solid-client/core";
import {
  SolidAuthResult,
  confirmAuthFromUrl,
  requestPasswordReset,
  signInWithPassword,
  signOutFromAuth,
  signUpWithPassword,
  updateRecoveryPassword,
} from "@solid-client/auth/solidAuthService";
type SessionValue = {
  session: Accessor<Session | null | undefined>;
  phase: Accessor<BootstrapPhaseSnapshot>;
  /** True while a recovery email link is establishing a set-new-password session. */
  passwordRecoveryRequired: Accessor<boolean>;
  signIn: (email: string, password: string) => Promise<SolidAuthResult>;
  signOut: () => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    username: string;
    acceptedLegal: boolean;
  }) => Promise<SolidAuthResult>;
  requestPasswordReset: (email: string) => Promise<SolidAuthResult>;
  updateRecoveryPassword: (password: string) => Promise<SolidAuthResult>;
  confirmAuthFromUrl: (href: string) => Promise<SolidAuthResult>;
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
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] =
    createSignal(false);

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
  } = supabase.auth.onAuthStateChange((event, next) => {
    // A recovery link lands as a PASSWORD_RECOVERY event carrying a short-lived
    // session — gate the app on a set-new-password screen until it's used.
    if (event === "PASSWORD_RECOVERY") setPasswordRecoveryRequired(true);
    else if (event === "SIGNED_OUT") setPasswordRecoveryRequired(false);
    sync(next ?? null);
  });
  onCleanup(() => subscription.unsubscribe());

  const signIn = signInWithPassword;
  const signOut = signOutFromAuth;
  // Clear the recovery gate once the new password is committed.
  const updateRecoveryPasswordAndClear = async (password: string) => {
    const result = await updateRecoveryPassword(password);
    if (!result.error) setPasswordRecoveryRequired(false);
    return result;
  };

  const value: SessionValue = {
    session,
    phase,
    passwordRecoveryRequired,
    signIn,
    signOut,
    signUp: signUpWithPassword,
    requestPasswordReset,
    updateRecoveryPassword: updateRecoveryPasswordAndClear,
    confirmAuthFromUrl,
  };

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
