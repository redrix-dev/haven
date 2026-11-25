// For the backend contract tests (packages/shared/src/lib/backend/__tests__):
// the real backend clients, signed in as the fixture people, against the
// local Supabase stack. Run them with `npm run test:backend`, which sets the
// environment and reloads the fixtures before each file.

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createBackend, type Backend } from "@shared/lib/backend";
import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type { Database } from "@shared/types/database";
import { loadBootstrappedTestUsers, type TestUserKey } from "../fixtures/users";
import { totp } from "./totp";

const requireEnv = (
  key:
    | "SUPABASE_URL"
    | "SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY"
    | "POSTGRES_URL",
) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Run these tests with: npm run test:backend`,
    );
  }
  return value;
};

export const localSupabaseEnv = {
  url: requireEnv("SUPABASE_URL"),
  anonKey: requireEnv("SUPABASE_ANON_KEY"),
  serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  postgresUrl: requireEnv("POSTGRES_URL"),
};

/** The operator's view, for looking at what is true. Skips RLS. */
export const serviceSupabase = createClient<Database>(
  localSupabaseEnv.url,
  localSupabaseEnv.serviceRoleKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export type Actor = {
  id: string;
  username: string;
  client: HavenSupabaseClient;
  backend: Backend;
};

const signedIn = new Map<TestUserKey, Actor>();
let staffWithFactor: Actor | null = null;

/**
 * One fixture person, signed in through the real Auth API with their own
 * client, so a test can act as two people at once.
 */
export async function actor(key: TestUserKey): Promise<Actor> {
  const known = signedIn.get(key);
  if (known) return known;
  const made = await signIn(key);
  signedIn.set(key, made);
  return made;
}

/**
 * The active staff account, signed in with a second factor as staff work
 * requires: it enrolls an authenticator and answers it, so the session is
 * aal2. `actor("platform_staff_active")` is the same account with a password
 * only, which the database refuses for staff work. The factor is deleted
 * again by `signOutAll`.
 */
export async function staffActor(): Promise<Actor> {
  if (staffWithFactor) return staffWithFactor;
  const made = await signIn("platform_staff_active");
  forgetFactors(made.id);
  const enrolled = await made.client.auth.mfa.enroll({ factorType: "totp" });
  if (enrolled.error) throw enrolled.error;
  const verified = await made.client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: await totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw verified.error;
  staffWithFactor = made;
  return made;
}

function forgetFactors(userId: string): void {
  sql(`delete from auth.mfa_factors where user_id = '${userId}'`);
}

async function signIn(key: TestUserKey): Promise<Actor> {
  const user = loadBootstrappedTestUsers()[key];
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
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return {
    id: user.id,
    username: user.username,
    client,
    backend: createBackend(client),
  };
}

/** Signs everyone out; call in afterAll. */
export async function signOutAll(): Promise<void> {
  const everyone = [...signedIn.values()];
  if (staffWithFactor) everyone.push(staffWithFactor);
  for (const known of everyone) {
    known.client.realtime.disconnect();
    await known.client.auth.signOut();
  }
  if (staffWithFactor) forgetFactors(staffWithFactor.id);
  staffWithFactor = null;
  signedIn.clear();
}

/** Runs SQL as the operator and returns the first column of each row. */
export function sql(statement: string): string[] {
  const output = execFileSync(
    "psql",
    [
      localSupabaseEnv.postgresUrl,
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
  );
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

/** The fixture community, TEST: Hearth (supabase/tests/fixtures/00_hearth.sql). */
export function hearthId(): string {
  const [id] = sql("select test_support.hearth_id()");
  if (!id) throw new Error("TEST: Hearth is missing. Run npm run test:db.");
  return id;
}

export function hearthChannelId(name: string): string {
  const [id] = sql(
    `select test_support.channel_id('${name.replace(/'/g, "''")}')`,
  );
  if (!id) throw new Error(`No fixture channel ${name}.`);
  return id;
}

/** Waits until `check` returns something, or fails after `ms`. */
export async function eventually<T>(
  check: () => T | undefined | null | false,
  ms = 5000,
): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`nothing arrived within ${ms}ms`);
}
