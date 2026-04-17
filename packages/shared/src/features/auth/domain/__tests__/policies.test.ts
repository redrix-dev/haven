import {
  buildSignUpMetadata,
  CURRENT_TOS_VERSION,
  validateLegalAcceptance,
  validatePasswordConfirmation,
  validateRecoveryPassword,
} from "@shared/features/auth/domain";

describe("auth policy helpers", () => {
  it("validates legal acceptance", () => {
    expect(validateLegalAcceptance(false)).toEqual({
      ok: false,
      error: "You must agree to the Terms of Service and Privacy Policy.",
    });
    expect(validateLegalAcceptance(true)).toEqual({ ok: true, error: null });
  });

  it("validates password confirmation", () => {
    expect(validatePasswordConfirmation("abc", "def")).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
    expect(validatePasswordConfirmation("same", "same")).toEqual({
      ok: true,
      error: null,
    });
  });

  it("validates recovery password requirements", () => {
    expect(validateRecoveryPassword("", "")).toEqual({
      ok: false,
      error: "New password is required.",
    });
    expect(validateRecoveryPassword("short", "short")).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
    expect(validateRecoveryPassword("password123", "different")).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
    expect(validateRecoveryPassword("password123", "password123")).toEqual({
      ok: true,
      error: null,
    });
  });

  it("builds signup metadata from shared constants", () => {
    const metadata = buildSignUpMetadata("  haven-user  ");
    expect(metadata.username).toBe("haven-user");
    expect(metadata.accepted_tos).toBe(true);
    expect(metadata.tos_version).toBe(CURRENT_TOS_VERSION);
    expect(typeof metadata.tos_accepted_at).toBe("string");
  });
});
