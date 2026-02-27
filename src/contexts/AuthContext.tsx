import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { desktopClient } from '@/shared/desktop/client';
import { getPlatformAuthConfirmRedirectUrl } from '@/shared/platform/urls';
import { getErrorMessage } from '@/shared/lib/errors';
import type {
  AuthError,
  EmailOtpType,
  PostgrestError,
  User,
  Session,
} from '@supabase/supabase-js';

type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  loading: boolean;
  passwordRecoveryRequired: boolean;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: AuthError | PostgrestError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  completePasswordRecovery: (password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

const normalizePathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

const parseAuthConfirmUrl = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    const pathname = normalizePathname(parsed.pathname);
    if (parsed.protocol === 'haven:') {
      return parsed.hostname === 'auth' && pathname === '/confirm' ? parsed : null;
    }
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && pathname === '/auth/confirm') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const parseAuthConfirmParams = (parsed: URL): Record<string, string> => {
  const next: Record<string, string> = {};
  const applyParams = (params: URLSearchParams) => {
    for (const [key, value] of params.entries()) {
      if (!next[key]) {
        next[key] = value;
      }
    }
  };

  applyParams(parsed.searchParams);
  if (parsed.hash.startsWith('#')) {
    applyParams(new URLSearchParams(parsed.hash.slice(1)));
  }

  return next;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] = useState(false);
  const loading = status === 'initializing';
  const processedAuthConfirmUrlsRef = useRef<Set<string>>(new Set());

  const consumeAuthConfirmUrl = useCallback(async (url: string): Promise<boolean> => {
    if (!url) return false;
    if (processedAuthConfirmUrlsRef.current.has(url)) return false;

    const parsedAuthConfirmUrl = parseAuthConfirmUrl(url);
    if (!parsedAuthConfirmUrl) return false;

    processedAuthConfirmUrlsRef.current.add(url);

    const params = parseAuthConfirmParams(parsedAuthConfirmUrl);
    const accessToken = params.access_token?.trim();
    const refreshToken = params.refresh_token?.trim();
    const tokenHash = params.token_hash?.trim();
    const otpType = params.type?.trim().toLowerCase() as EmailOtpType | undefined;
    const isRecoveryLink = otpType === 'recovery';

    try {
      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
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
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (verifyError) throw verifyError;
        if (otpType === 'recovery') {
          setPasswordRecoveryRequired(true);
        }
        return true;
      }

      throw new Error('Verification link is missing required token fields.');
    } catch (authUrlError: unknown) {
      console.error('Failed to process Haven auth confirmation URL:', authUrlError);
      setError(getErrorMessage(authUrlError, 'Failed to confirm verification link.'));
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
        setError(null);
      } catch (err: unknown) {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setStatus('error');
        setError(getErrorMessage(err, 'Failed to initialize authentication.'));
      }
    };

    void initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      setError(null);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryRequired(true);
      } else if (event === 'SIGNED_OUT') {
        setPasswordRecoveryRequired(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!desktopClient.isAvailable()) return;

    let disposed = false;
    let unsubscribe = () => {};

    const handleProtocolUrl = (url: string) => {
      if (disposed) return;
      void consumeAuthConfirmUrl(url);
    };

    try {
      unsubscribe = desktopClient.onProtocolUrl(handleProtocolUrl);
    } catch (eventError) {
      console.error('Failed to subscribe to protocol URL events:', eventError);
    }

    const drainPendingProtocolUrls = async () => {
      try {
        while (!disposed) {
          const url = await desktopClient.consumeNextProtocolUrl();
          if (!url) break;
          if (disposed) break;
          await consumeAuthConfirmUrl(url);
        }
      } catch (consumeError) {
        if (!disposed) {
          console.error('Failed to consume pending protocol URL events:', consumeError);
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
    if (desktopClient.isAvailable()) return;
    if (typeof window === 'undefined') return;

    let disposed = false;

    const consumeBrowserAuthConfirmUrl = async () => {
      const currentUrl = window.location.href;
      const didProcess = await consumeAuthConfirmUrl(currentUrl);
      if (!didProcess || disposed) return;

      const parsed = parseAuthConfirmUrl(currentUrl);
      if (!parsed) return;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

      try {
        window.history.replaceState({}, document.title, '/');
      } catch (historyError) {
        if (!disposed) {
          console.warn('Failed to clear browser auth confirmation URL:', historyError);
        }
      }
    };

    void consumeBrowserAuthConfirmUrl();

    return () => {
      disposed = true;
    };
  }, [consumeAuthConfirmUrl]);

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getPlatformAuthConfirmRedirectUrl(),
        data: {
          username: username.trim(),
        },
      },
    });

    if (error) return { error };

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPlatformAuthConfirmRedirectUrl(),
    });

    return { error };
  };

  const completePasswordRecovery = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (!error) {
      setPasswordRecoveryRequired(false);
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPasswordRecoveryRequired(false);
  };

  const deleteAccount = async () => {
    const { error: deleteError } = await supabase.rpc('delete_own_account' as never);
    if (deleteError) throw deleteError;

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.warn('Failed to sign out after account deletion:', signOutError);
    }

    setSession(null);
    setUser(null);
    setStatus('unauthenticated');
    setError(null);
    setPasswordRecoveryRequired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        status,
        error,
        loading,
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
