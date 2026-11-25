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

/**
 * The database's username rule (`profiles.username` check). Hyphens and other
 * marks are out because a mention is `@` and these characters. Sign-up must
 * check it first: the database swaps a name that breaks it for `user_<id>`
 * rather than refuse the sign-up.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{2,32}$/;

export const validateUsername = (
  username: string,
): PasswordValidationResult => {
  if (!USERNAME_PATTERN.test(username.trim())) {
    return {
      ok: false,
      error:
        "Usernames are 2 to 32 letters, numbers or underscores, with no spaces or hyphens.",
    };
  }
  return { ok: true, error: null };
};

/**
 * What sign-up sends with the new login. The database (on_auth_user_created)
 * reads `username`, and records the terms the person agreed to when
 * `terms_version` names a published version.
 */
export const buildSignUpMetadata = (username: string) => ({
  username: username.trim(),
  terms_version: CURRENT_TOS_VERSION,
});
