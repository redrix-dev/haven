/**
 * Staff accounts work on the staff site, never in the apps. Supabase Auth's
 * access-token hook (`public.auth_hook_access_token`) writes
 * `staff_account: true` into a staff account's token, so an app can tell the
 * moment sign-in returns, before anything loads, and sign it out.
 *
 * This reads the token without checking its signature, which is fine for what
 * it decides: whether to show the app. The database never trusts the claim;
 * `require_user` refuses a staff account by its `platform_staff` row, so a
 * token edited either way gains nothing.
 */
export const STAFF_ACCOUNT_MESSAGE =
  "This is a Haven staff account. Staff work happens on the staff site. Sign in with your own account to use Haven.";

export function isStaffAccountToken(
  accessToken: string | null | undefined,
): boolean {
  const payload = accessToken?.split(".")[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    // JWTs drop base64 padding. Browsers and Node decode it anyway, so no
    // unit test can catch this line missing; it is here for runtimes whose
    // atob is strict (not checked on Hermes).
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const claims: unknown = JSON.parse(atob(padded));
    return (
      typeof claims === "object" &&
      claims !== null &&
      (claims as { staff_account?: unknown }).staff_account === true
    );
  } catch {
    return false;
  }
}
