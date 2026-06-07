import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@shared/platform/lib/errors";
import { resendConfirmation } from "@/auth/mobileAuthService";

const COOLDOWN_SECONDS = 120;

/**
 * Resend-confirmation flow shared by the signup "check your email" screen and the
 * login screen. Enforces a 120s cooldown between sends so users can't burn the
 * Supabase resend rate limit, and surfaces a short status note.
 */
export function useResendConfirmation() {
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    // setState inside a timer (async) — not a synchronous effect write.
    const timer = setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = useCallback(
    async (email: string) => {
      if (resending || cooldown > 0) return;
      setResending(true);
      setNote("");
      try {
        const { error } = await resendConfirmation(email);
        if (error) throw error;
        setNote("Sent. Check your inbox again.");
        setCooldown(COOLDOWN_SECONDS);
      } catch (err) {
        setNote(getErrorMessage(err));
      } finally {
        setResending(false);
      }
    },
    [resending, cooldown],
  );

  return { resend, resending, note, cooldown };
}
