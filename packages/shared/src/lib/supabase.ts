import { createHavenSupabaseClient } from './createHavenSupabaseClient';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const isProduction = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'development';
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment or .env file.'
  );
}

export const supabase = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: isProduction || isDev, // Persist sessions in production and developmentr environments
    detectSessionInUrl: false,
  },
});
