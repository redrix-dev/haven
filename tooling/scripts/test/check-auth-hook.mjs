// Proves the access-token hook is switched on, by signing in through the real
// Auth API: an ordinary account gets a token, a restricted one is refused, and
// lifting the restriction lets it back in.
//
// The SQL suites cannot show this. They call the hook function directly; only
// Auth calling it proves supabase/config.toml (or, on a hosted project, the
// dashboard switch) is in effect. With the hook off nothing fails loudly: a
// restricted person can still sign in and read, they just cannot write.
//
// Usage (local Supabase running, test users made by `npm run test:db`):
//   npm run test:db:auth-hook

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseLocalEnv } from "./resolve-supabase-local-env.mjs";

const env = resolveSupabaseLocalEnv();

function sql(statement) {
  return execFileSync(
    "psql",
    [
      env.POSTGRES_URL,
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { encoding: "utf8" },
  ).trim();
}

async function signIn(email, password) {
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  return error
    ? { ok: false, text: `refused (${error.status}): ${error.message}` }
    : { ok: true, text: `token issued for ${data.user.email}` };
}

const ordinary = {
  email: "rls-member-a@example.test",
  password: "HavenTest!MemberA1",
};
const restricted = {
  email: "rls-member-b@example.test",
  password: "HavenTest!MemberB1",
};
const restrictedId = `(select id from auth.users where email = '${restricted.email}')`;

const results = [];
try {
  results.push([
    "an ordinary account signs in",
    true,
    await signIn(ordinary.email, ordinary.password),
  ]);
  sql(
    `insert into public.account_restrictions (user_id) select ${restrictedId}`,
  );
  results.push([
    "a restricted account is refused",
    false,
    await signIn(restricted.email, restricted.password),
  ]);
  sql(
    `update public.account_restrictions set lifted_at = now() where user_id = ${restrictedId} and case_id is null`,
  );
  results.push([
    "after the restriction is lifted it signs in",
    true,
    await signIn(restricted.email, restricted.password),
  ]);
} finally {
  sql(
    `delete from public.account_restrictions where user_id = ${restrictedId} and case_id is null`,
  );
}

let failed = false;
for (const [name, expectOk, result] of results) {
  const pass = result.ok === expectOk;
  failed ||= !pass;
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}: ${result.text}`);
}
if (failed) {
  console.error(
    "\n[auth-hook] The hook is not in effect. Locally: check [auth.hook.custom_access_token] in supabase/config.toml and restart Supabase.",
  );
  process.exitCode = 1;
}
