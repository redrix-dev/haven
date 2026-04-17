import Constants from "expo-constants";
import {
  createHavenSupabaseClient,
  type HavenSupabaseClient,
} from "@shared/lib/createHavenSupabaseClient";
import { getMobileAuthStorageAdapter } from "./authStorage";

let client: HavenSupabaseClient | null = null;

export function getMobileSupabase(): HavenSupabaseClient {
  if (client) return client;

  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;
  const url = extra?.supabaseUrl?.trim();
  const key = extra?.supabaseAnonKey?.trim();

  if (!url || !key) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env (see .env.example).",
    );
  }

  client = createHavenSupabaseClient(url, key, {
    auth: {
      storage: getMobileAuthStorageAdapter(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}
