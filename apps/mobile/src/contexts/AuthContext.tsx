import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { requireHavenCore } from "@mobile-data";
import { requireAuthStore } from "@mobile-data";
import type { AuthStoreState } from "@shared/core/sessionStorePorts";
import { bootLogger } from "@shared/debug/bootLogger";
import { getAppHost } from "@shared/infrastructure/platform/appHost";
import { getPlatformAuthConfirmRedirectUrl } from "@shared/infrastructure/platform/urls";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  buildSignUpMetadata,
  parseAuthConfirmParams,
  parseAuthConfirmUrl,
  SUPPORTED_EMAIL_OTP_TYPES,
  validateLegalAcceptance,
} from "@shared/features/auth/domain";
import type {
  EmailOtpType,
  PostgrestError,
  User,
  Session,
} from "@supabase/supabase-js";

// Bounded bootstrap exception: auth may touch the raw Supabase client to
// establish, recover, refresh, and end a session. Domain reads/writes belong in
// HavenCore/Nexus after the session exists.
const havenAuthClient = () => requireHavenCore().backends.client;

type HavenAuthClient = ReturnType<typeof havenAuthClient>;
type HavenAuthError = Awaited<
  ReturnType<HavenAuthClient["auth"]["signInWithPassword"]>
>["error"];

const authStore = () => requireAuthStore();

function useAuthStoreSelector<T>(selector: (state: AuthStoreState) => T): T {
  const store = requireAuthStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "error";

interface AuthContextValue {
  status: AuthStatus;
  error: string | null;
  passwordRecoveryRequired: boolean;
  signUp: (
    email: string,
    password: string,
    username: string,
    acceptedLegal: boolean,
  ) => Promise<{ error: HavenAuthError | PostgrestError | Error | null }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: HavenAuthError | null }>;
  requestPasswordReset: (
    email: string,
  ) => Promise<{ error: HavenAuthError | null }>;
  completePasswordRecovery: (
    password: string,
  ) => Promise<{ error: HavenAuthError | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type UseAuthResult = AuthContextValue & {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] =
    useState(false);
  const processedAuthConfirmUrlsRef = useRef<Set<string>>(new Set());
  const activeSessionUserIdRef = useRef<string | null>(null);

  const consumeAuthConfirmUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (!url) return false;
      if (processedAuthConfirmUrlsRef.current.has(url)) return false;

      const parsedAuthConfirmUrl = parseAuthConfirmUrl(url);
      if (!parsedAuthConfirmUrl) return false;

      processedAuthConfirmUrlsRef.current.add(url);

      const params = parseAuthConfirmParams(parsedAuthConfirmUrl);
      const accessToken = params.access_token?.trim();
      const refreshToken = params.refresh_token?.trim();
      const tokenHash = params.token_hash?.trim();
      const otpType = params.type?.trim().toLowerCase() as
        | EmailOtpType
        | undefined;
      const isRecoveryLink = otpType === "recovery";

      try {
        if (accessToken && refreshToken) {
          const { error: setSessionError } =
            await havenAuthClient().auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          if (setSessionError) throw setSessionError;
          if (isRecoveryLink) {
            setPasswordRecoveryRequired(true);
          }
          return true;
        }

        if (tokenHash && otpType && SUPPORTED_EMAIL_OTP_TYPES.has(otpType)) {
          const { error: verifyError } = await havenAuthClient().auth.verifyOtp(
            {
              token_hash: tokenHash,
              type: otpType,
            },
          );
          if (verifyError) throw verifyError;
          if (otpType === "recovery") {
            setPasswordRecoveryRequired(true);
          }
          return true;
        }

        throw new Error("Verification link is missing required token fields.");
      } catch (authUrlError: unknown) {
        console.error(
          "Failed to process Haven auth confirmation URL:",
          authUrlError,
        );
        setError(
          getErrorMessage(authUrlError, "Failed to confirm verification link."),
        );
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      bootLogger.mark("auth-check-start");
      authStore().getState().setIsLoading(true);
      try {
        const {
          data: { session },
          error,
        } = await havenAuthClient().auth.getSession();

        if (error) throw error;
        if (!isMounted) return;

        const { setSession, setUser, setIsLoading } = authStore().getState();
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        setStatus(session?.user ? "authenticated" : "unauthenticated");
        setError(null);
        bootLogger.mark("auth-check-complete", {
          authenticated: Boolean(session?.user),
        });
      } catch (err: unknown) {
        if (!isMounted) return;
        const { setSession, setUser, setIsLoading } = authStore().getState();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        setStatus("error");
        setError(getErrorMessage(err, "Failed to initialize authentication."));
        bootLogger.mark("auth-check-error");
      }
    };

    void initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = havenAuthClient().auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      const nextUser = session?.user ?? null;
      const currentUserId = authStore().getState().user?.id ?? null;
      const shouldSkipUserUpdate =
        event === "TOKEN_REFRESHED" ||
        (event === "SIGNED_IN" &&
          nextUser?.id != null &&
          nextUser.id === currentUserId);
      const { setSession, setUser, setIsLoading } = authStore().getState();
      setSession(session);
      if (!shouldSkipUserUpdate) {
        setUser(nextUser);
      }
      setIsLoading(false);
      setStatus(session?.user ? "authenticated" : "unauthenticated");
      setError(null);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryRequired(true);
      } else if (event === "SIGNED_OUT") {
        setPasswordRecoveryRequired(false);
      }

      // Auth's only handoff into the domain runtime is bootstrap/clear. Keep
      // domain loading, realtime routing, and Nexus coordination inside Core.
      const core = requireHavenCore();

      if (event === "SIGNED_OUT") {
        activeSessionUserIdRef.current = null;
        void core.clearSession();
      } else if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        const userId = session?.user?.id ?? null;
        if (!userId) {
          activeSessionUserIdRef.current = null;
          return;
        }
        if (activeSessionUserIdRef.current === userId) return;
        activeSessionUserIdRef.current = userId;
        bootLogger.mark("session-bootstrap-start");
        void core.bootstrapSession(userId).catch((err) => {
          console.warn("[AuthContext] bootstrapSession failed", err);
        });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const authBridge = getAppHost().desktopAuth;
    if (!getAppHost().isDesktopApp() || !authBridge) return;

    let disposed = false;
    let unsubscribe = () => {};

    const handleProtocolUrl = (url: string) => {
      if (disposed) return;
      void consumeAuthConfirmUrl(url);
    };

    try {
      unsubscribe = authBridge.onProtocolUrl(handleProtocolUrl);
    } catch (eventError) {
      console.error("Failed to subscribe to protocol URL events:", eventError);
    }

    const drainPendingProtocolUrls = async () => {
      try {
        while (!disposed) {
          const url = await authBridge.consumeNextProtocolUrl();
          if (!url) break;
          if (disposed) break;
          await consumeAuthConfirmUrl(url);
        }
      } catch (consumeError) {
        if (!disposed) {
          console.error(
            "Failed to consume pending protocol URL events:",
            consumeError,
          );
        }
      }
    };

    void drainPendingProtocolUrls();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [consumeAuthConfirmUrl]);

  useEffect(() => {
    if (getAppHost().isDesktopApp() && getAppHost().desktopAuth) return;
    const browserRuntime = getAppHost().browserRuntime;
    if (!browserRuntime) return;

    let disposed = false;

    const consumeBrowserAuthConfirmUrl = async () => {
      const currentUrl = browserRuntime.getLocationHref();
      if (!currentUrl) return;
      const didProcess = await consumeAuthConfirmUrl(currentUrl);
      if (!didProcess || disposed) return;

      const parsed = parseAuthConfirmUrl(currentUrl);
      if (!parsed) return;
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

      try {
        browserRuntime.replaceHistoryUrl("/");
      } catch (historyError) {
        if (!disposed) {
          console.warn(
            "Failed to clear browser auth confirmation URL:",
            historyError,
          );
        }
      }
    };

    void consumeBrowserAuthConfirmUrl();

    return () => {
      disposed = true;
    };
  }, [consumeAuthConfirmUrl]);

  const signUp = async (
    email: string,
    password: string,
    username: string,
    acceptedLegal: boolean,
  ) => {
    const legalValidation = validateLegalAcceptance(acceptedLegal);
    if (!legalValidation.ok) {
      return {
        error: new Error(
          legalValidation.error ?? "Legal acceptance is required.",
        ),
      };
    }

    const { error } = await havenAuthClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getPlatformAuthConfirmRedirectUrl(),
        data: buildSignUpMetadata(username),
      },
    });

    if (error) return { error };

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await havenAuthClient().auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await havenAuthClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: getPlatformAuthConfirmRedirectUrl(),
      },
    );

    return { error };
  };

  const completePasswordRecovery = async (password: string) => {
    const { error } = await havenAuthClient().auth.updateUser({
      password,
    });

    if (!error) {
      setPasswordRecoveryRequired(false);
    }

    return { error };
  };

  const signOut = async () => {
    await havenAuthClient().auth.signOut();
    setPasswordRecoveryRequired(false);
  };

  const deleteAccount = async () => {
    const { error: deleteError } = await havenAuthClient().rpc(
      "delete_own_account" as never,
    );
    if (deleteError) throw deleteError;

    const { error: signOutError } = await havenAuthClient().auth.signOut();
    if (signOutError) {
      console.warn("Failed to sign out after account deletion:", signOutError);
    }

    const { setSession, setUser, setIsLoading } = authStore().getState();
    setSession(null);
    setUser(null);
    setIsLoading(false);
    setStatus("unauthenticated");
    setError(null);
    setPasswordRecoveryRequired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        error,
        passwordRecoveryRequired,
        signUp,
        signIn,
        requestPasswordReset,
        completePasswordRecovery,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): UseAuthResult {
  const context = useContext(AuthContext);
  const user = useAuthStoreSelector((state) => state.user);
  const session = useAuthStoreSelector((state) => state.session);
  const loading = useAuthStoreSelector((state) => state.isLoading);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  const {
    status,
    error,
    passwordRecoveryRequired,
    signUp,
    signIn,
    requestPasswordReset,
    completePasswordRecovery,
    signOut,
    deleteAccount,
  } = context;

  return React.useMemo(
    () => ({
      status,
      error,
      passwordRecoveryRequired,
      signUp,
      signIn,
      requestPasswordReset,
      completePasswordRecovery,
      signOut,
      deleteAccount,
      user,
      session,
      loading,
    }),
    [
      status,
      error,
      passwordRecoveryRequired,
      signUp,
      signIn,
      requestPasswordReset,
      completePasswordRecovery,
      signOut,
      deleteAccount,
      user,
      session,
      loading,
    ],
  );
}
