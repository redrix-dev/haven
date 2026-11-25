import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  localSupabaseEnv,
  serviceSupabase,
} from "@test-support/setup/supabaseLocal";
import {
  buildSignUpMetadata,
  validateUsername,
} from "@shared/features/auth/domain/policies";
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

  it("tells a visitor whether a name is taken", async () => {
    const visitor = createBackend(
      createHavenSupabaseClient(
        localSupabaseEnv.url,
        localSupabaseEnv.anonKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      ),
    );
    const name = `taken_${randomUUID().slice(0, 8)}`;
    expect(await visitor.people.usernameTaken(name)).toBe(false);
    const { data } = await serviceSupabase.auth.admin.createUser({
      email: `${name}@example.test`,
      password: "a long enough password",
      email_confirm: true,
      user_metadata: buildSignUpMetadata(name),
    });
    try {
      expect(await visitor.people.usernameTaken(name.toUpperCase())).toBe(true);
    } finally {
      await serviceSupabase.auth.admin.deleteUser(data.user!.id);
    }
  });

  // The database swaps a name that breaks its rule for `user_<id>` instead of
  // refusing, so the form's check is the only place a person hears about it.
  // It must refuse exactly what the database would swap.
  it("refuses in the form exactly the names the database would replace", async () => {
    const r = randomUUID().replace(/-/g, "").slice(0, 12);
    const names = [
      `k${r}`,
      `k_${r}`,
      `k-${r}`,
      `k ${r}`,
      `k${r}é`,
      `k${r}`.padEnd(32, "x"),
      `k${r}`.padEnd(33, "x"),
      "k",
    ];
    for (const name of names) {
      const { data, error } = await serviceSupabase.auth.admin.createUser({
        email: `name-${randomUUID()}@example.test`,
        password: "a long enough password",
        email_confirm: true,
        user_metadata: buildSignUpMetadata(name),
      });
      expect(error).toBeNull();
      const userId = data.user!.id;
      try {
        const { data: profile } = await serviceSupabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .single();
        const kept = profile!.username === name;
        expect({ name, kept }).toEqual({
          name,
          kept: validateUsername(name).ok,
        });
      } finally {
        await serviceSupabase.auth.admin.deleteUser(userId);
      }
    }
  });
});
