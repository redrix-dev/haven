import {
  parseAuthConfirmParams,
  parseAuthConfirmUrl,
  SUPPORTED_EMAIL_OTP_TYPES,
} from "@shared/features/auth/domain";

describe("auth confirm URL parsing", () => {
  it("accepts haven://auth/confirm deep links", () => {
    const parsed = parseAuthConfirmUrl(
      "haven://auth/confirm#access_token=abc&refresh_token=def&type=recovery",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("haven:");
  });

  it("accepts https /auth/confirm links", () => {
    const parsed = parseAuthConfirmUrl(
      "https://projects.haven.redrixx.com/auth/confirm?token_hash=token&type=signup",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.pathname).toBe("/auth/confirm");
  });

  it("rejects unrelated URLs", () => {
    expect(
      parseAuthConfirmUrl("https://projects.haven.redrixx.com/settings"),
    ).toBeNull();
  });

  it("merges search and hash params while preserving first value", () => {
    const parsed = parseAuthConfirmUrl(
      "haven://auth/confirm?type=recovery#access_token=abc&refresh_token=def&type=signup",
    );
    expect(parsed).not.toBeNull();
    const params = parseAuthConfirmParams(parsed as URL);
    expect(params.type).toBe("recovery");
    expect(params.access_token).toBe("abc");
    expect(params.refresh_token).toBe("def");
  });

  it("includes supported supabase email otp types", () => {
    expect(SUPPORTED_EMAIL_OTP_TYPES.has("recovery")).toBe(true);
    expect(SUPPORTED_EMAIL_OTP_TYPES.has("email_change")).toBe(true);
  });
});
