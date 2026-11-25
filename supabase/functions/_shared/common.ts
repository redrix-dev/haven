// What every Haven Edge Function shares: the two kinds of database client, the
// worker secret check, and plain JSON replies.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Db = SupabaseClient;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
} as const;

export function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A setting from the function's environment; null when unset or blank. */
export function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const noSession = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

/** The service role: for workers only. It skips RLS. */
export function serviceDb(): Db {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    noSession,
  );
}

/**
 * The database as the person who called this function: their token is passed
 * on, so every RPC sees them and applies the same rules as in the apps. Null
 * when the request carries no token.
 */
export function callerDb(req: Request): Db | null {
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^bearer\s+\S+$/i.test(authorization.trim())) return null;
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      ...noSession,
      global: { headers: { Authorization: authorization.trim() } },
    },
  );
}

/** Calls an RPC and returns its result, or throws with the function's name. */
export async function call<T>(
  db: Db,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

function sameText(a: string, b: string): boolean {
  // Compares every character whatever the result, so the time taken says
  // nothing about how much of a guess was right.
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}

/**
 * True when the request carries the worker secret. The database sends it in
 * `x-haven-worker-secret` (see private.wake_worker); the function knows it as
 * HAVEN_WORKER_CRON_SECRET. With no secret configured nothing is let in.
 */
export function isWorkerCall(req: Request): boolean {
  const expected = env("HAVEN_WORKER_CRON_SECRET");
  if (!expected || expected.length < 16) return false;
  return sameText(expected, req.headers.get("x-haven-worker-secret") ?? "");
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** For functions the apps call from a browser or webview. */
export function reply(body: unknown, status = 200): Response {
  return json(body, status, corsHeaders);
}

// The database's refusals (docs/architecture/DATABASE.md, "Errors"), plus the
// API's own answers to a missing or expired token.
const STATUS_BY_CODE: Record<string, number> = {
  PT401: 401,
  PGRST301: 401,
  PGRST302: 401,
  PGRST303: 401,
  "42501": 403,
  PT404: 404,
  PT409: 409,
  PT429: 429,
  "22023": 400,
};

/**
 * Passes a database refusal on to the caller unchanged: the same status, the
 * same sentence, the same reason word. Anything that is not a refusal is a
 * fault and says nothing about itself.
 */
export function refusal(error: {
  code?: string;
  message: string;
  details?: string | null;
}): Response {
  const status = STATUS_BY_CODE[error.code ?? ""];
  if (!status) {
    console.error(`database error ${error.code ?? "?"}: ${error.message}`);
    return reply(
      { reason: "server_error", message: "Something went wrong." },
      500,
    );
  }
  return reply(
    { reason: error.details ?? "refused", message: error.message },
    status,
  );
}
