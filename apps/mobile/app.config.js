/**
 * Merges onto `app.json` (Expo passes it as `config`).
 * Use EXPO_PUBLIC_* in `apps/mobile/.env` for values read at build time.
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
});
