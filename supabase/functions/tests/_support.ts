// Shared by the function tests. They run the real handlers against the local
// Supabase stack: the real database, the real storage. Only services outside
// Haven (Expo, Resend, LiveKit, other people's websites) are stood in for, by
// a small server on this machine that records what it was sent.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";

function need(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set. Run: npm run test:functions`);
  }
  return value;
}

export const SUPABASE_URL = need("SUPABASE_URL");
const ANON_KEY = need("SUPABASE_ANON_KEY");

/** The operator's view: for setting a scene and looking at what is true. */
export const sql = postgres(need("POSTGRES_URL"), {
  max: 3,
  onnotice: () => {},
});

export const service: SupabaseClient = createClient(
  SUPABASE_URL,
  need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const WORKER_SECRET = "function-tests-worker-secret";

const USERS = {
  owner: ["rls-owner@example.test", "HavenTest!Owner1"],
  member_a: ["rls-member-a@example.test", "HavenTest!MemberA1"],
  member_b: ["rls-member-b@example.test", "HavenTest!MemberB1"],
  non_member: ["rls-non-member@example.test", "HavenTest!NonMember1"],
  staff_active: ["rls-staff-active@example.test", "HavenTest!StaffActive1"],
} as const;

export type Actor = {
  db: SupabaseClient;
  id: string;
  email: string;
  token: string;
};

const signedIn = new Map<string, Actor>();

/** One of the fixture people, signed in through the real Auth API. */
export async function actor(who: keyof typeof USERS): Promise<Actor> {
  const known = signedIn.get(who);
  if (known) return known;
  const [email, password] = USERS[who];
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(
      `could not sign in ${email}: ${error?.message}. Run npm run test:db first.`,
    );
  }
  const made = {
    db,
    id: data.user.id,
    email,
    token: data.session.access_token,
  };
  signedIn.set(who, made);
  return made;
}

/** Calls an RPC as that person and returns the result; a refusal throws. */
export async function rpc<T>(
  who: Actor,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await who.db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} (${error.details})`);
  return data as T;
}

export async function channelId(name: string): Promise<string> {
  const [row] = await sql`
    select ch.id from public.channels ch
    join public.communities c on c.id = ch.community_id
    where c.name = 'TEST: Hearth' and ch.name = ${name}`;
  if (!row) throw new Error(`no fixture channel ${name}. Run npm run test:db.`);
  return row.id;
}

export type JobRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  run_at: Date;
};

/** The newest job of a kind whose payload has this value under this key. */
export async function jobFor(
  kind: string,
  key: string,
  value: string,
): Promise<JobRow | null> {
  const [row] = await sql<JobRow[]>`
    select id, kind, status, attempts, last_error, run_at from private.jobs
    where kind = ${kind} and payload ->> ${key} = ${value}
    order by created_at desc, id desc limit 1`;
  return row ?? null;
}

/**
 * Makes the test the only thing working the queue: the database is told no
 * worker address (so it wakes nobody), unfinished jobs from earlier runs are
 * dropped, and rate limits are forgotten so a test can be run again and again.
 */
export async function quietQueue(): Promise<void> {
  await sql`delete from vault.secrets where name in ('haven.edge_base_url', 'haven.worker_secret')`;
  await sql`delete from private.jobs where status in ('pending', 'running')`;
  await sql`delete from private.rate_limit_hits`;
  Deno.env.set("HAVEN_WORKER_CRON_SECRET", WORKER_SECRET);
}

/** A request the way the database sends one to wake a worker. */
export function wake(secret: string | null = WORKER_SECRET): Request {
  return new Request("http://worker.test/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { "x-haven-worker-secret": secret }),
    },
    body: "{}",
  });
}

export type Captured = {
  method: string;
  path: string;
  headers: Headers;
  text: string;
  json: unknown;
};

export type Fake = {
  url: string;
  requests: Captured[];
  close: () => Promise<void>;
};

/** A stand-in for an outside service. It records every request it gets. */
export function fakeService(
  respond: (request: Captured) => Response | Promise<Response>,
): Fake {
  const requests: Captured[] = [];
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    async (req) => {
      const text = await req.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Not JSON; the raw text is kept.
      }
      const url = new URL(req.url);
      const captured = {
        method: req.method,
        path: url.pathname + url.search,
        headers: req.headers,
        text,
        json,
      };
      requests.push(captured);
      return respond(captured);
    },
  );
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    requests,
    close: () => server.shutdown(),
  };
}

/** The middle part of a signed token, as an object. */
export function tokenClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
}

export const random = () => crypto.randomUUID().slice(0, 8);

/**
 * Supabase clients keep timers and sockets open for their whole life, which
 * Deno's leak checks would report on every test.
 */
export function test(name: string, fn: () => Promise<void>): void {
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

export function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e)
    throw new Error(`FAILED: ${message}\n  expected ${e}\n  got      ${a}`);
}
