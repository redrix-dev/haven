import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { getPlatformAuthConfirmRedirectUrl } from "@shared/platform/urls";
import {
  buildSignUpMetadata,
  parseAuthConfirmParams,
  parseAuthConfirmUrl,
  validateLegalAcceptance,
  validatePasswordConfirmation,
  validateRecoveryPassword,
} from "@shared/features/auth/domain";

export type MobileAuthResult = { error: unknown | null };

type MobileVerifyOtpParams = Parameters<ReturnType<typeof getMobileSupabase>["auth"]["verifyOtp"]>[0];
type MobileEmailOtpType = Extract<MobileVerifyOtpParams, { token_hash: string }>["type"];

const SUPPORTED_MOBILE_EMAIL_OTP_TYPES = new Set<MobileEmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseMobileEmailOtpType(value: string | undefined): MobileEmailOtpType | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return SUPPORTED_MOBILE_EMAIL_OTP_TYPES.has(normalized as MobileEmailOtpType)
    ? (normalized as MobileEmailOtpType)
    : null;
}

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
    return { error: new Error(legalValidation.error ?? "Legal acceptance is required.") };
  }

  const passwordValidation = validatePasswordConfirmation(
    input.password,
    input.confirmPassword,
  );
  if (!passwordValidation.ok) {
    return { error: new Error(passwordValidation.error ?? "Passwords do not match.") };
  }

  const { error } = await getMobileSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: getPlatformAuthConfirmRedirectUrl(),
      data: buildSignUpMetadata(input.username),
    },
  });

  return { error };
};

export const resendConfirmation = async (email: string): Promise<MobileAuthResult> => {
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
      emailRedirectTo: getPlatformAuthConfirmRedirectUrl(),
    },
  });
  return { error };
};

export const requestPasswordReset = async (email: string): Promise<MobileAuthResult> => {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: new Error("Enter your email address.") };
  }
  const { error } = await getMobileSupabase().auth.resetPasswordForEmail(trimmed, {
    redirectTo: getPlatformAuthConfirmRedirectUrl(),
  });
  return { error };
};

export const completePasswordRecovery = async (
  newPassword: string,
  confirmPassword: string,
): Promise<MobileAuthResult> => {
  const passwordValidation = validateRecoveryPassword(newPassword, confirmPassword);
  if (!passwordValidation.ok) {
    return { error: new Error(passwordValidation.error ?? "Invalid password.") };
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

export const consumeAuthConfirmUrl = async (
  candidateUrl: string | null | undefined,
): Promise<{ didProcess: boolean; requiresPasswordRecovery: boolean }> => {
  if (!candidateUrl) {
    return { didProcess: false, requiresPasswordRecovery: false };
  }

  const parsedAuthConfirmUrl = parseAuthConfirmUrl(candidateUrl);
  if (!parsedAuthConfirmUrl) {
    return { didProcess: false, requiresPasswordRecovery: false };
  }

  const params = parseAuthConfirmParams(parsedAuthConfirmUrl);
  const accessToken = params.access_token?.trim();
  const refreshToken = params.refresh_token?.trim();
  const tokenHash = params.token_hash?.trim();
  const otpType = parseMobileEmailOtpType(params.type);
  const isRecovery = otpType === "recovery";

  if (accessToken && refreshToken) {
    const { error: setSessionError } = await getMobileSupabase().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setSessionError) throw setSessionError;
    return { didProcess: true, requiresPasswordRecovery: isRecovery };
  }

  if (tokenHash && otpType) {
    const { error: verifyError } = await getMobileSupabase().auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (verifyError) throw verifyError;
    return { didProcess: true, requiresPasswordRecovery: isRecovery };
  }

  return { didProcess: false, requiresPasswordRecovery: false };
};
