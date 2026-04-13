import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export type HavenSupabaseClient = SupabaseClient<Database>;

type CreateClientOptions = NonNullable<Parameters<typeof createClient<Database>>[2]>;

/**
 * Single factory for Supabase clients (web singleton, RN, tests).
 * Callers supply full `auth` options (persistSession, storage, etc.).
 */
export function createHavenSupabaseClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  options?: CreateClientOptions,
): HavenSupabaseClient {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options);
}
