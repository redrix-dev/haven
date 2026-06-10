const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("path");
const metroResolver = require("metro-resolver");
const { extraThemes } = require("./uniwind-themes.generated.cjs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const sharedPackageRoot = path.resolve(monorepoRoot, "packages/shared");
const sharedSrcRoot = path.join(sharedPackageRoot, "src");
const mobileSrcRoot = path.join(projectRoot, "src");
const mobileDataRoot = path.join(mobileSrcRoot, "data");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedPackageRoot];
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

const finalConfig = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
  extraThemes,
});

const upstreamResolveRequest = finalConfig.resolver.resolveRequest;

/**
 * Metro resolves imports before Babel rewrites them, so path aliases from
 * babel-plugin-module-resolver / tsconfig must be mirrored here.
 */
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = metroResolver.resolve;

  if (moduleName.startsWith("@shared/")) {
    const absolutePath = path.join(
      sharedSrcRoot,
      moduleName.slice("@shared/".length),
    );
    return resolve({ ...context, resolveRequest: resolve }, absolutePath, platform);
  }

  if (moduleName === "@mobile-data" || moduleName.startsWith("@mobile-data/")) {
    const sub =
      moduleName === "@mobile-data"
        ? ""
        : moduleName.slice("@mobile-data/".length);
    const absolutePath = sub
      ? path.join(mobileDataRoot, sub)
      : mobileDataRoot;
    return resolve({ ...context, resolveRequest: resolve }, absolutePath, platform);
  }

  if (moduleName.startsWith("@platform/")) {
    const absolutePath = path.join(
      sharedSrcRoot,
      "platform",
      moduleName.slice("@platform/".length),
    );
    return resolve({ ...context, resolveRequest: resolve }, absolutePath, platform);
  }

  if (moduleName.startsWith("@/")) {
    const absolutePath = path.join(mobileSrcRoot, moduleName.slice("@/".length));
    return resolve({ ...context, resolveRequest: resolve }, absolutePath, platform);
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return resolve(context, moduleName, platform);
};

module.exports = finalConfig;
