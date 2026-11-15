import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  localSupabaseEnv,
  serviceSupabase,
} from "@test-support/setup/supabaseLocal";
import { buildSignUpMetadata } from "@shared/features/auth/domain/policies";
import { termsToAccept } from "@shared/collections/account/selectors";
import { createHavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createBackend } from "@shared/lib/backend";

describe("signing up (contract)", { timeout: 20_000 }, () => {
  it("records the username and the terms the app sends", async () => {
    const client = createHavenSupabaseClient(
      localSupabaseEnv.url,
      localSupabaseEnv.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const username = `new_${randomUUID().slice(0, 8)}`;
    const { data, error } = await client.auth.signUp({
      email: `${username}@example.test`,
      password: "a long enough password",
      options: { data: buildSignUpMetadata(` ${username} `) },
    });
    expect(error).toBeNull();
    const userId = data.user!.id;
    try {
      const account = await createBackend(client).people.loadMyAccount({
        platform: "web",
      });
      expect(account.profile).not.toBeNull();
      const [me] = await createBackend(client).people.getProfiles([userId]);
      expect(me.username).toBe(username);
      // Signing up agreed to the newest terms; nothing is left to accept.
      expect(termsToAccept({ ...account, requests: {} })).toBeNull();
    } finally {
      await client.auth.signOut();
      await serviceSupabase.auth.admin.deleteUser(userId);
    }
  });
});
