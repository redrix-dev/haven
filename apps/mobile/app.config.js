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
/**
 * iOS does not resolve a tailnet short name (`flex5-linux`): the request fails
 * with "A server with the specified hostname could not be found". So mobile
 * gets the full MagicDNS name, and a full name needs its own http exception.
 * The name is read from the URL at build time, never written in this repo.
 */
function devBackendTransportSecurity() {
  let url;
  try {
    url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return {};
  }
  if (url.protocol !== "http:" || !url.hostname.includes(".")) return {};
  return {
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        [url.hostname]: { NSExceptionAllowsInsecureHTTPLoads: true },
      },
    },
  };
}

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
        CFBundleDisplayName: "Haven Dev",
        ...devBackendTransportSecurity(),
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
