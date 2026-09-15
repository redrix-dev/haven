import type { EmailOtpType } from "@supabase/supabase-js";
import { SUPPORTED_EMAIL_OTP_TYPES } from "./authConfirm";

export type AuthConfirmResult = { error: unknown | null };

/** The slice of Supabase auth an email link needs. */
export type AuthLinkExchanger = {
  exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
  verifyOtp(input: {
    type: EmailOtpType;
    token_hash: string;
  }): Promise<{ error: unknown }>;
  setSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ error: unknown }>;
};

/**
 * Turn an auth email link's params into a session. Desktop and mobile both use
 * it for the link pipeline's `confirm_auth`.
 *
 * Nothing else reads the tokens on those clients: `detectSessionInUrl` is off
 * on desktop, and a native app has no page URL. Supabase currently sends
 * implicit-flow links (`#access_token` + `refresh_token`). `code` (PKCE) and
 * `token_hash` (custom templates) are handled for when the templates move.
 *
 * A link with none of those is an error, not a silent success.
 */
export async function confirmAuthFromParams(
  params: Readonly<Record<string, string | undefined>>,
  auth: AuthLinkExchanger,
): Promise<AuthConfirmResult> {
  const failure = params.error_description?.trim() || params.error?.trim();
  if (failure) return { error: new Error(failure) };

  const accessToken = params.access_token?.trim();
  const refreshToken = params.refresh_token?.trim();
  if (accessToken && refreshToken) {
    const { error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error };
  }

  const code = params.code?.trim();
  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    return { error };
  }

  const tokenHash = params.token_hash?.trim();
  const type = params.type?.trim().toLowerCase();
  if (
    tokenHash &&
    type &&
    SUPPORTED_EMAIL_OTP_TYPES.has(type as EmailOtpType)
  ) {
    const { error } = await auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    return { error };
  }

  return { error: new Error("This link is missing its sign-in details.") };
}
