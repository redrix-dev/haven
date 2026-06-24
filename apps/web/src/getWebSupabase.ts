import {
  createHavenSupabaseClient,
  type HavenSupabaseClient,
} from "@shared/lib/createHavenSupabaseClient";

export type WebSupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function getWebSupabaseConfig(): WebSupabaseConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (repo root .env locally; Vercel project env vars in prod).",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

let client: HavenSupabaseClient | null = null;

export function getWebSupabase(): HavenSupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = getWebSupabaseConfig();
  client = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Web supports auth redirects (magic link / OAuth) landing in the URL.
      detectSessionInUrl: true,
    },
  });

  return client;
}
