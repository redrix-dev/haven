const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const sharedPackageRoot = path.resolve(monorepoRoot, "packages/shared");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedPackageRoot];
config.resolver.disableHierarchicalLookup = true;
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

module.exports = withNativeWind(config, { input: "./global.css" });
