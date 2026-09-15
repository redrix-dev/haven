import { confirmAuthFromParams } from "@shared/features/auth/domain/confirmAuthParams";
import { buildHavenLink } from "@shared/features/links";
import {
  buildSignUpMetadata,
  validateLegalAcceptance,
} from "@shared/features/auth/domain/policies";
import { requireHavenSolidCore } from "@solid-client/core";

export type SolidAuthResult = { error: unknown | null };

const authClient = () => requireHavenSolidCore().backends.client.auth;

/**
 * Where Supabase sends the confirmation/recovery email link: always an https
 * page on the app domain, with the client that asked for it named in the path
 * (`/auth/confirm/web`, `/auth/confirm/desktop`). The page then confirms in the
 * browser or hands the link to the installed app — so a desktop link opened on
 * a phone still works. Web uses its own origin so previews and local dev land
 * on themselves; desktop has no web origin of its own, so it uses the canonical
 * one. Every pattern must be allow-listed in the Supabase Auth redirect
 * settings.
 */
function authConfirmRedirectUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin.startsWith("http")
    ? buildHavenLink(
        { kind: "auth_confirm", client: "web", params: {} },
        origin,
      )
    : buildHavenLink({ kind: "auth_confirm", client: "desktop", params: {} });
}

export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().signInWithPassword({ email, password });
  return { error };
};

export const signOutFromAuth = async (): Promise<void> => {
  await authClient().signOut();
};

export const signUpWithPassword = async (input: {
  email: string;
  password: string;
  username: string;
  acceptedLegal: boolean;
}): Promise<SolidAuthResult> => {
  const legal = validateLegalAcceptance(input.acceptedLegal);
  if (!legal.ok) {
    return { error: new Error(legal.error ?? "Legal acceptance is required.") };
  }
  const { error } = await authClient().signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: authConfirmRedirectUrl(),
      data: buildSignUpMetadata(input.username),
    },
  });
  return { error };
};

/** Send a password-reset email. Always resolves (don't leak whether an account exists). */
export const requestPasswordReset = async (
  email: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().resetPasswordForEmail(email.trim(), {
    redirectTo: authConfirmRedirectUrl(),
  });
  return { error };
};

/** Set a new password during an active recovery session (after the email link). */
export const updateRecoveryPassword = async (
  password: string,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().updateUser({ password });
  return { error };
};

/**
 * Exchange an auth email link's params (from the link pipeline) for a session.
 * Desktop needs this for every link — `detectSessionInUrl` is off there. The
 * logic is shared with mobile: `@shared/features/auth/domain/confirmAuthParams`.
 */
export const confirmAuthLink = (
  params: Readonly<Record<string, string | undefined>>,
): Promise<SolidAuthResult> => confirmAuthFromParams(params, authClient());
