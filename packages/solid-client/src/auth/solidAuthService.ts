import type { EmailOtpType } from "@supabase/supabase-js";
import {
  parseAuthConfirmParams,
  parseAuthConfirmUrl,
} from "@shared/features/auth/domain/authConfirm";
import {
  buildSignUpMetadata,
  validateLegalAcceptance,
} from "@shared/features/auth/domain/policies";
import { requireHavenSolidCore } from "@solid-client/core";

export type SolidAuthResult = { error: unknown | null };

const authClient = () => requireHavenSolidCore().backends.client.auth;

/**
 * Where Supabase sends the confirmation/recovery email link. On web it's the
 * live origin's `/auth/confirm` (Supabase's `detectSessionInUrl` consumes the
 * token there); on desktop it's the `haven://auth/confirm` deep link, which the
 * shell forwards to `confirmAuthFromUrl`. Both must be allow-listed in the
 * Supabase Auth redirect settings (web prod + preview origins, and `haven://`).
 */
function authConfirmRedirectUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin.startsWith("http")
    ? `${origin}/auth/confirm`
    : "haven://auth/confirm";
}

export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().signInWithPassword({ email, password });
  return { error };
};

export const signOutFromAuth = async (): Promise<void> => {
  await authClient().signOut();
};

export const signUpWithPassword = async (input: {
  email: string;
  password: string;
  username: string;
  acceptedLegal: boolean;
}): Promise<SolidAuthResult> => {
  const legal = validateLegalAcceptance(input.acceptedLegal);
  if (!legal.ok) {
    return { error: new Error(legal.error ?? "Legal acceptance is required.") };
  }
  const { error } = await authClient().signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: authConfirmRedirectUrl(),
      data: buildSignUpMetadata(input.username),
    },
  });
  return { error };
};

/** Send a password-reset email. Always resolves (don't leak whether an account exists). */
export const requestPasswordReset = async (
  email: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().resetPasswordForEmail(email.trim(), {
    redirectTo: authConfirmRedirectUrl(),
  });
  return { error };
};

/** Set a new password during an active recovery session (after the email link). */
export const updateRecoveryPassword = async (
  password: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().updateUser({ password });
  return { error };
};

/**
 * Exchange a confirmation/recovery link for a session. Needed on desktop, where
 * `detectSessionInUrl` is off and the link arrives as a `haven://` deep link; on
 * web Supabase already consumes the URL, so this is a no-op fallback there.
 */
export const confirmAuthFromUrl = async (
  href: string,
): Promise<SolidAuthResult> => {
  const parsed = parseAuthConfirmUrl(href);
  if (!parsed) return { error: new Error("Invalid confirmation link.") };

  const params = parseAuthConfirmParams(parsed);
  if (params.error_description || params.error) {
    return { error: new Error(params.error_description ?? params.error) };
  }
  if (params.code) {
    const { error } = await authClient().exchangeCodeForSession(params.code);
    return { error };
  }
  if (params.token_hash && params.type) {
    const { error } = await authClient().verifyOtp({
      type: params.type as EmailOtpType,
      token_hash: params.token_hash,
    });
    return { error };
  }
  // Implicit (#access_token) links are handled by detectSessionInUrl on web.
  return { error: null };
};
