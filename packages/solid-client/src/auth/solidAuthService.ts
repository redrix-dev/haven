import { confirmAuthFromParams } from "@shared/features/auth/domain/confirmAuthParams";
import {
  authConfirmRedirectUrl,
  type AuthEmailClient,
} from "@shared/features/auth/domain/authConfirmRedirect";
import {
  buildSignUpMetadata,
  validateLegalAcceptance,
} from "@shared/features/auth/domain/policies";
import { requireHavenSolidCore } from "@solid-client/core";

export type SolidAuthResult = { error: unknown | null };

const authClient = () => requireHavenSolidCore().backends.client.auth;

const pageOrigin = () =>
  typeof window !== "undefined" ? window.location.origin : "";

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

export const signUpWithPassword = async (
  input: {
    email: string;
    password: string;
    username: string;
    acceptedLegal: boolean;
  },
  client: AuthEmailClient,
): Promise<SolidAuthResult> => {
  const legal = validateLegalAcceptance(input.acceptedLegal);
  if (!legal.ok) {
    return { error: new Error(legal.error ?? "Legal acceptance is required.") };
  }
  const { error } = await authClient().signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: authConfirmRedirectUrl(client, pageOrigin()),
      data: buildSignUpMetadata(input.username),
    },
  });
  return { error };
};

/** Send a password-reset email. Always resolves (don't leak whether an account exists). */
export const requestPasswordReset = async (
  email: string,
  client: AuthEmailClient,
): Promise<SolidAuthResult> => {
  const { error } = await authClient().resetPasswordForEmail(email.trim(), {
    redirectTo: authConfirmRedirectUrl(client, pageOrigin()),
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
