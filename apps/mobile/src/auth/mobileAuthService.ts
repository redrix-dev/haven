import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { buildHavenLink } from "@shared/features/links";
import {
  buildSignUpMetadata,
  confirmAuthFromParams,
  validateLegalAcceptance,
  validatePasswordConfirmation,
  validateRecoveryPassword,
  validateUsername,
} from "@shared/features/auth/domain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireHavenCore } from "@mobile-data";
import { unregisterThisPushDevice } from "@/hooks/useMobileExpoPushRegistration";

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

  const name = validateUsername(input.username);
  if (!name.ok) return { error: new Error(name.error ?? "") };
  // Ask first: a taken name would not refuse the sign-up, the database would
  // swap it for user_<id>. Someone can still take it in between; then the
  // swap happens and they rename in settings.
  if (await requireHavenCore().backend.people.usernameTaken(input.username)) {
    return {
      error: new Error(`"${input.username.trim()}" is taken. Try another.`),
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

/** Stops pushes to this phone while still signed in, then signs out. */
export const signOutFromAuth = async (): Promise<void> => {
  await unregisterThisPushDevice();
  await getMobileSupabase().auth.signOut();
};

/**
 * Deletes the account (refused, `owns_communities`, while they own a
 * community with others in it), then signs out so the session clears.
 */
export const deleteOwnAccount = async (): Promise<void> => {
  await requireHavenCore().account.deleteAccount();
  await AsyncStorage.removeItem("haven:lastExpoPushToken");
  const { error: signOutError } = await getMobileSupabase().auth.signOut();
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
