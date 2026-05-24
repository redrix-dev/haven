import Constants from "expo-constants";
import {
  createHavenSupabaseClient,
  type HavenSupabaseClient,
} from "@shared/lib/createHavenSupabaseClient";
import { getMobileAuthStorageAdapter } from "./authStorage";

let client: HavenSupabaseClient | null = null;

export type MobileSupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function resolveMobileSupabaseConfig(): MobileSupabaseConfig {
  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;

  // OTA bundles may launch with a custom manifest that omits `extra`, so keep a
  // compile-time fallback using Expo's EXPO_PUBLIC env inlining.
  // Use || (not ??) so empty strings from app.config.js also fall through to the env fallback.
  const supabaseUrl =
    extra?.supabaseUrl?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey =
    extra?.supabaseAnonKey?.trim() || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  return { supabaseUrl, supabaseAnonKey };
}

export function getMobileSupabase(): HavenSupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = resolveMobileSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env (see .env.example).",
    );
  }

  client = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: getMobileAuthStorageAdapter(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}
