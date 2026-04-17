import type { EmailOtpType } from "@supabase/supabase-js";

export const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

const normalizePathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
};

export const parseAuthConfirmUrl = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    const pathname = normalizePathname(parsed.pathname);
    if (parsed.protocol === "haven:") {
      return parsed.hostname === "auth" && pathname === "/confirm" ? parsed : null;
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      pathname === "/auth/confirm"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const parseAuthConfirmParams = (parsed: URL): Record<string, string> => {
  const next: Record<string, string> = {};
  const applyParams = (params: URLSearchParams) => {
    for (const [key, value] of params.entries()) {
      if (!next[key]) {
        next[key] = value;
      }
    }
  };

  applyParams(parsed.searchParams);
  if (parsed.hash.startsWith("#")) {
    applyParams(new URLSearchParams(parsed.hash.slice(1)));
  }
  return next;
};
