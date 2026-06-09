import {
  createHavenSupabaseClient,
  type HavenSupabaseClient,
} from "@shared/lib/createHavenSupabaseClient";

export type TauriSupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function getTauriSupabaseConfig(): TauriSupabaseConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (repo root .env or apps/tauri/.env).",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

let client: HavenSupabaseClient | null = null;

export function getTauriSupabase(): HavenSupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = getTauriSupabaseConfig();
  client = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}
