import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { desktopClient } from '@/shared/desktop/client';
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
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: AuthError | PostgrestError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
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

const parseProtocolUrl = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'haven:' ? parsed : null;
  } catch {
    return null;
  }
};

const isAuthConfirmProtocolUrl = (url: string): boolean => {
  const parsed = parseProtocolUrl(url);
  if (!parsed) return false;
  return parsed.hostname === 'auth' && parsed.pathname === '/confirm';
};

const parseProtocolParams = (url: string): Record<string, string> => {
  const parsed = parseProtocolUrl(url);
  if (!parsed) return {};

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
  const loading = status === 'initializing';
  const processedProtocolUrlsRef = useRef<Set<string>>(new Set());

  const consumeProtocolAuthUrl = useCallback(async (url: string) => {
    if (!url) return;
    if (processedProtocolUrlsRef.current.has(url)) return;
    processedProtocolUrlsRef.current.add(url);

    if (!isAuthConfirmProtocolUrl(url)) return;

    const params = parseProtocolParams(url);
    const accessToken = params.access_token?.trim();
    const refreshToken = params.refresh_token?.trim();
    const tokenHash = params.token_hash?.trim();
    const otpType = params.type?.trim().toLowerCase() as EmailOtpType | undefined;

    try {
      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setSessionError) throw setSessionError;
        return;
      }

      if (tokenHash && otpType && SUPPORTED_EMAIL_OTP_TYPES.has(otpType)) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (verifyError) throw verifyError;
        return;
      }

      throw new Error('Verification link is missing required token fields.');
    } catch (authUrlError: unknown) {
      console.error('Failed to process Haven auth confirmation URL:', authUrlError);
      setError(getErrorMessage(authUrlError, 'Failed to confirm verification link.'));
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      setError(null);
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
      void consumeProtocolAuthUrl(url);
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
          await consumeProtocolAuthUrl(url);
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
  }, [consumeProtocolAuthUrl]);

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim()
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

  const signOut = async () => {
    await supabase.auth.signOut();
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
  };

  return (
    <AuthContext.Provider
      value={{ user, session, status, error, loading, signUp, signIn, signOut, deleteAccount }}
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
