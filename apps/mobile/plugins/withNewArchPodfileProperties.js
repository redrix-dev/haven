/**
 * Ensures `ios/Podfile.properties.json` sets `newArchEnabled` to `"true"`
 * and builds React Native from source.
 * The Podfile reads this into `ENV['RCT_NEW_ARCH_ENABLED']`; `"false"` breaks
 * react-native-reanimated (and matches nothing we want on SDK 55).
 * Source-built React Native core is also required for dev-client builds because
 * expo-dev-launcher links against dev-support symbols such as
 * `RCTPackagerConnection` that are omitted from the SDK 55 prebuilt RNCore.
 */
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

function withNewArchPodfileProperties(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const target = path.join(root, "Podfile.properties.json");
      if (!fs.existsSync(target)) {
        return cfg;
      }
      const json = JSON.parse(fs.readFileSync(target, "utf8"));
      if (
        json.newArchEnabled === "true" &&
        json["ios.buildReactNativeFromSource"] === "true"
      ) {
        return cfg;
      }
      json.newArchEnabled = "true";
      json["ios.buildReactNativeFromSource"] = "true";
      fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
      return cfg;
    },
  ]);
}

module.exports = withNewArchPodfileProperties;
