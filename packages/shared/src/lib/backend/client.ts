/**
 * The two ways a backend client talks to the database: calling an RPC and
 * reading a table through RLS (docs/architecture/DATABASE.md, rule 3). Both
 * throw HavenError, so every client fails the same way.
 *
 * RPC names and argument names are checked against the generated types
 * (`npm run supabase:types`): a renamed function or parameter is a type error
 * here, not a 404 at run time.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type { Database } from "@shared/types/database";
import { fromDatabaseError } from "./havenError";

type Functions = Database["public"]["Functions"];
export type RpcName = keyof Functions;

/** The RPC's arguments. Any of them may be null: SQL decides what null means. */
export type RpcArgs<F extends RpcName> = Functions[F]["Args"] extends never
  ? Record<string, never>
  : { [K in keyof Functions[F]["Args"]]: Functions[F]["Args"][K] | null };

/**
 * Calls an RPC as the signed-in person and returns what it returned. The
 * result is `unknown` on purpose: the caller says which record it is, from
 * records.ts, because the generated types cannot describe the database's own
 * record types precisely.
 */
export async function rpc<F extends RpcName>(
  client: HavenSupabaseClient,
  fn: F,
  args: RpcArgs<F>,
): Promise<unknown> {
  // An argument left undefined is left out, so the SQL default applies.
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw fromDatabaseError(error);
  return data;
}

/** For an RPC that returns a set: always an array, never null. */
export async function rpcRows<T, F extends RpcName = RpcName>(
  client: HavenSupabaseClient,
  fn: F,
  args: RpcArgs<F>,
): Promise<T[]> {
  const data = await rpc(client, fn, args);
  return (Array.isArray(data) ? data : []) as T[];
}

/**
 * For the result of a table read (`client.from(...).select(...)`): the rows,
 * or a HavenError. RLS removes what the caller may not see; it never refuses.
 */
export function rows<T>(result: {
  data: T[] | null;
  error: { code?: string; message: string; details?: string | null } | null;
}): T[] {
  if (result.error) throw fromDatabaseError(result.error);
  return result.data ?? [];
}

export function maybeRow<T>(result: {
  data: T | null;
  error: { code?: string; message: string; details?: string | null } | null;
}): T | null {
  if (result.error) throw fromDatabaseError(result.error);
  return result.data;
}
