import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Email link types Supabase can verify from a `token_hash`. Reading auth links
 * themselves is `parseHavenLink`'s job (`@shared/features/links`).
 */
export const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);
