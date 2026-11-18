// Proves the access-token hook is switched on, by signing in through the real
// Auth API: a staff account's token says so and cannot be refreshed until the
// authenticator check is done, an ordinary account gets a token, a restricted
// one is refused, and lifting the restriction lets it back in.
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

/** Reads a token's claims; the signature is Auth's own, so this only looks. */
function claimsOf(accessToken) {
  return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url"));
}

/** The current RFC 6238 code for a base32 secret, as an authenticator app shows. */
async function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < key.length; i++) {
    key[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(Date.now() / 30000)));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, counter.buffer),
  );
  const offset = mac[mac.length - 1] & 0x0f;
  const value =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

function client() {
  return createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const staff = {
  email: "rls-staff-active@example.test",
  password: "HavenTest!StaffActive1",
};
const staffPerson = {
  email: "rls-staff-person@example.test",
  password: "HavenTest!StaffPerson1",
};
const staffId = `(select id from auth.users where email = '${staff.email}')`;

/** What the token of a fresh password sign-in says about staff. */
async function staffClaim(email, password) {
  const { data, error } = await client().auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, text: `refused: ${error.message}` };
  const claim = claimsOf(data.session.access_token).staff_account;
  return { ok: claim === true, text: `staff_account = ${claim}` };
}

/** Refreshes a staff session; `withFactor` completes the authenticator check first. */
async function staffRefresh(withFactor) {
  const auth = client().auth;
  const signedIn = await auth.signInWithPassword(staff);
  if (signedIn.error) return { ok: false, text: signedIn.error.message };
  if (withFactor) {
    const enrolled = await auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error) return { ok: false, text: enrolled.error.message };
    const verified = await auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: await totp(enrolled.data.totp.secret),
    });
    if (verified.error) return { ok: false, text: verified.error.message };
  }
  const { data: current } = await auth.getSession();
  const aal = claimsOf(current.session.access_token).aal;
  const refreshed = await auth.refreshSession();
  return refreshed.error
    ? { ok: false, text: `${aal} refresh refused: ${refreshed.error.message}` }
    : { ok: true, text: `${aal} refresh issued a token` };
}

const results = [];
try {
  sql(`delete from auth.mfa_factors where user_id = ${staffId}`);
  results.push([
    "a staff account's token says staff_account",
    true,
    await staffClaim(staff.email, staff.password),
  ]);
  results.push([
    "a staff member's own account's token does not",
    false,
    await staffClaim(staffPerson.email, staffPerson.password),
  ]);
  results.push([
    "a password-only staff session cannot be refreshed",
    false,
    await staffRefresh(false),
  ]);
  results.push([
    "after the authenticator check it can",
    true,
    await staffRefresh(true),
  ]);
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
  sql(`delete from auth.mfa_factors where user_id = ${staffId}`);
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
