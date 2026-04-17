export const CURRENT_TOS_VERSION = "2026-03-24";

export type PasswordValidationResult = {
  ok: boolean;
  error: string | null;
};

export const validateLegalAcceptance = (
  acceptedLegal: boolean,
): PasswordValidationResult => {
  if (!acceptedLegal) {
    return {
      ok: false,
      error: "You must agree to the Terms of Service and Privacy Policy.",
    };
  }
  return { ok: true, error: null };
};

export const validatePasswordConfirmation = (
  password: string,
  confirmPassword: string,
): PasswordValidationResult => {
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, error: null };
};

export const validateRecoveryPassword = (
  password: string,
  confirmPassword: string,
): PasswordValidationResult => {
  if (!password) {
    return { ok: false, error: "New password is required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  return validatePasswordConfirmation(password, confirmPassword);
};

export const buildSignUpMetadata = (username: string) => ({
  username: username.trim(),
  accepted_tos: true,
  tos_version: CURRENT_TOS_VERSION,
  tos_accepted_at: new Date().toISOString(),
});
