import { SUPPORTED_EMAIL_OTP_TYPES } from "@shared/features/auth/domain";

describe("SUPPORTED_EMAIL_OTP_TYPES", () => {
  it("includes supported supabase email otp types", () => {
    expect(SUPPORTED_EMAIL_OTP_TYPES.has("recovery")).toBe(true);
    expect(SUPPORTED_EMAIL_OTP_TYPES.has("email_change")).toBe(true);
  });
});
