import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const TEST_USERS = [
  { key: 'community_owner', email: 'rls-owner@example.test', password: 'HavenTest!Owner1', username: 'rls_owner' },
  { key: 'member_a', email: 'rls-member-a@example.test', password: 'HavenTest!MemberA1', username: 'rls_member_a' },
  { key: 'member_b', email: 'rls-member-b@example.test', password: 'HavenTest!MemberB1', username: 'rls_member_b' },
  { key: 'non_member', email: 'rls-non-member@example.test', password: 'HavenTest!NonMember1', username: 'rls_non_member' },
  { key: 'server_mod', email: 'rls-server-mod@example.test', password: 'HavenTest!ServerMod1', username: 'rls_server_mod' },
  { key: 'platform_staff_active', email: 'rls-staff-active@example.test', password: 'HavenTest!StaffActive1', username: 'rls_staff_active' },
  { key: 'platform_staff_inactive', email: 'rls-staff-inactive@example.test', password: 'HavenTest!StaffInactive1', username: 'rls_staff_inactive' },
];

async function listAllUsers(adminClient) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
    page += 1;
  }
  return users;
}

async function ensureUser(adminClient, spec) {
  const allUsers = await listAllUsers(adminClient);
  const existing = allUsers.find((user) => user.email?.toLowerCase() === spec.email.toLowerCase());

  if (existing) {
    const { error } = await adminClient.auth.admin.updateUserById(existing.id, {
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: {
        testFixture: true,
        fixtureKey: spec.key,
        username: spec.username,
        preferred_username: spec.username,
      },
    });
    if (error) throw error;
    return { id: existing.id, email: spec.email, password: spec.password, key: spec.key, username: spec.username };
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
    user_metadata: {
      testFixture: true,
      fixtureKey: spec.key,
      username: spec.username,
      preferred_username: spec.username,
    },
  });
  if (error) throw error;
  if (!data.user?.id) {
    throw new Error(`Admin createUser returned no user id for ${spec.email}`);
  }
  return { id: data.user.id, email: spec.email, password: spec.password, key: spec.key, username: spec.username };
}

async function main() {
  const env = resolveSupabaseLocalEnv();
  const adminClient = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = [];
  for (const spec of TEST_USERS) {
    results.push(await ensureUser(adminClient, spec));
  }

  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/tests/.generated');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'users.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        users: Object.fromEntries(
          results.map((user) => [
            user.key,
            {
              id: user.id,
              email: user.email,
              password: user.password,
              username: user.username,
            },
          ])
        ),
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Bootstrapped ${results.length} local auth users -> ${outPath}`);
}

main().catch((error) => {
  console.error('Failed to bootstrap local auth users:', error);
  process.exitCode = 1;
});
