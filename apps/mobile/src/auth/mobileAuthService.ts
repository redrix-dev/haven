import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { buildHavenLink } from "@shared/features/links";
import {
  buildSignUpMetadata,
  confirmAuthFromParams,
  validateLegalAcceptance,
  validatePasswordConfirmation,
  validateRecoveryPassword,
} from "@shared/features/auth/domain";

export type MobileAuthResult = { error: unknown | null };

/**
 * Auth emails land on the app domain's iOS confirm page, which hands the link
 * back to this app. An https page rather than `haven://` directly, so a link
 * opened on a laptop still leads somewhere (checklist D2).
 */
const AUTH_CONFIRM_REDIRECT_URL = buildHavenLink({
  kind: "auth_confirm",
  client: "ios",
  params: {},
});

export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<MobileAuthResult> => {
  const { error } = await getMobileSupabase().auth.signInWithPassword({
    email,
    password,
  });
  return { error };
};

export const signUpWithPassword = async (input: {
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
  acceptedLegal: boolean;
}): Promise<MobileAuthResult> => {
  const legalValidation = validateLegalAcceptance(input.acceptedLegal);
  if (!legalValidation.ok) {
    return {
      error: new Error(
        legalValidation.error ?? "Legal acceptance is required.",
      ),
    };
  }

  const passwordValidation = validatePasswordConfirmation(
    input.password,
    input.confirmPassword,
  );
  if (!passwordValidation.ok) {
    return {
      error: new Error(passwordValidation.error ?? "Passwords do not match."),
    };
  }

  const { error } = await getMobileSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL,
      data: buildSignUpMetadata(input.username),
    },
  });

  return { error };
};

/** True when a sign-in failed specifically because the email isn't confirmed yet. */
export const isEmailNotConfirmedError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code =
    typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const message =
    typeof candidate.message === "string"
      ? candidate.message.toLowerCase()
      : "";
  return code === "email_not_confirmed" || message.includes("not confirmed");
};

export const resendConfirmation = async (
  email: string,
): Promise<MobileAuthResult> => {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: new Error("Enter your email address.") };
  }
  // Passes emailRedirectTo so the resent link is the haven:// deep link (unlike a
  // Supabase dashboard resend, which falls back to the Site URL / web client).
  const { error } = await getMobileSupabase().auth.resend({
    type: "signup",
    email: trimmed,
    options: {
      emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL,
    },
  });
  return { error };
};

export const requestPasswordReset = async (
  email: string,
): Promise<MobileAuthResult> => {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: new Error("Enter your email address.") };
  }
  const { error } = await getMobileSupabase().auth.resetPasswordForEmail(
    trimmed,
    {
      redirectTo: AUTH_CONFIRM_REDIRECT_URL,
    },
  );
  return { error };
};

export const completePasswordRecovery = async (
  newPassword: string,
  confirmPassword: string,
): Promise<MobileAuthResult> => {
  const passwordValidation = validateRecoveryPassword(
    newPassword,
    confirmPassword,
  );
  if (!passwordValidation.ok) {
    return {
      error: new Error(passwordValidation.error ?? "Invalid password."),
    };
  }

  const { error } = await getMobileSupabase().auth.updateUser({
    password: newPassword,
  });
  return { error };
};

export const signOutFromAuth = async (): Promise<void> => {
  await getMobileSupabase().auth.signOut();
};

/** Matches web `AuthContext.deleteAccount`: RPC then sign out so session listeners clear state. */
export const deleteOwnAccount = async (): Promise<void> => {
  const supabase = getMobileSupabase();
  const { error: deleteError } = await supabase.rpc("delete_own_account");
  if (deleteError) throw deleteError;

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.warn("Failed to sign out after account deletion:", signOutError);
  }
};

/**
 * Exchange an auth email link's params for a session — the link pipeline's
 * `confirm_auth`. Same logic as desktop: implicit tokens, PKCE `code`, and
 * `token_hash`; Supabase's `error_description` comes back as the error.
 */
export const confirmAuthLink = (
  params: Readonly<Record<string, string | undefined>>,
): Promise<MobileAuthResult> =>
  confirmAuthFromParams(params, getMobileSupabase().auth);
