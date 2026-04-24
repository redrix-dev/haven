const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const metroResolver = require("metro-resolver");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const sharedPackageRoot = path.resolve(monorepoRoot, "packages/shared");
const webClientPackageRoot = path.resolve(monorepoRoot, "packages/web-client");
const sharedSrcRoot = path.join(sharedPackageRoot, "src");
const webClientAppUiRoot = path.join(webClientPackageRoot, "src", "app-ui");
const mobileSrcRoot = path.join(projectRoot, "src");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedPackageRoot, webClientPackageRoot];
// Rely on explicit `nodeModulesPaths` + `extraNodeModules` for the monorepo. Keeping the
// default `disableHierarchicalLookup: false` matches expo-doctor and Expo’s baseline;
// the explicit resolver paths still pin React/RN/Expo to `apps/mobile/node_modules`.
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  react: path.join(mobileNodeModules, "react"),
  "react/jsx-runtime": path.join(mobileNodeModules, "react/jsx-runtime"),
  "react-native": path.join(mobileNodeModules, "react-native"),
  expo: path.join(mobileNodeModules, "expo"),
  "expo-asset": path.join(mobileNodeModules, "expo-asset"),
  "react-native-reanimated": path.join(mobileNodeModules, "react-native-reanimated"),
};

const finalConfig = withNativeWind(config, { input: "./global.css" });

const upstreamResolveRequest = finalConfig.resolver.resolveRequest;

/**
 * Metro resolves imports before Babel rewrites them, so path aliases from
 * babel-plugin-module-resolver / tsconfig must be mirrored here.
 */
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = metroResolver.resolve;

  if (moduleName.startsWith("@shared/app/ui/")) {
    const absolutePath = path.join(
      webClientAppUiRoot,
      moduleName.slice("@shared/app/ui/".length),
    );
    return resolve(
      { ...context, resolveRequest: resolve },
      absolutePath,
      platform,
    );
  }

  if (moduleName.startsWith("@shared/")) {
    const absolutePath = path.join(
      sharedSrcRoot,
      moduleName.slice("@shared/".length),
    );
    return resolve(
      { ...context, resolveRequest: resolve },
      absolutePath,
      platform,
    );
  }

  if (moduleName.startsWith("@platform/")) {
    const absolutePath = path.join(
      sharedSrcRoot,
      "platform",
      moduleName.slice("@platform/".length),
    );
    return resolve(
      { ...context, resolveRequest: resolve },
      absolutePath,
      platform,
    );
  }

  if (moduleName.startsWith("@client/app/")) {
    const absolutePath = path.join(
      sharedSrcRoot,
      "app",
      moduleName.slice("@client/app/".length),
    );
    return resolve(
      { ...context, resolveRequest: resolve },
      absolutePath,
      platform,
    );
  }

  if (moduleName.startsWith("@/")) {
    const absolutePath = path.join(
      mobileSrcRoot,
      moduleName.slice("@/".length),
    );
    return resolve(
      { ...context, resolveRequest: resolve },
      absolutePath,
      platform,
    );
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return resolve(context, moduleName, platform);
};

module.exports = finalConfig;
