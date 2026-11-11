/**
 * Merges onto `app.json` (Expo passes it as `config`).
 * Use EXPO_PUBLIC_* in `apps/mobile/.env` for values read at build time.
 */

/**
 * A build made with `npm run devdb -- run -- ...` talks to the dev backend
 * (docs/DEV_BACKEND.md). Such a build must not pull a production OTA bundle
 * over itself, and has to be allowed plain http to a tailnet host.
 * These land in the native projects, so they take effect at prebuild.
 */
function withDevBackend(config) {
  return {
    ...config,
    // Off: the OTA channel in app.json is production's.
    updates: { ...config.updates, enabled: false },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        // So the home screen says which backend this install talks to.
        // iOS already allows http to a dotless host (NSAllowsLocalNetworking).
        CFBundleDisplayName: "Haven Dev",
      },
    },
    plugins: (config.plugins ?? []).map((plugin) =>
      plugin === "expo-build-properties"
        ? [
            "expo-build-properties",
            // Android release builds refuse plain http unless told otherwise.
            { android: { usesCleartextTraffic: true } },
          ]
        : plugin,
    ),
  };
}

module.exports = ({ config }) => {
  const base = {
    ...config,
    extra: {
      ...config.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
  };
  return process.env.HAVEN_DEV_BACKEND === "1" ? withDevBackend(base) : base;
};
