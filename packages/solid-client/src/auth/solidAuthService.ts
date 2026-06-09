import { requireHavenSolidCore } from "@solid-client/core";

export type SolidAuthResult = { error: unknown | null };

export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<SolidAuthResult> => {
  const { error } =
    await requireHavenSolidCore().backends.client.auth.signInWithPassword({
      email,
      password,
    });
  return { error };
};

export const signOutFromAuth = async (): Promise<void> => {
  await requireHavenSolidCore().backends.client.auth.signOut();
};
