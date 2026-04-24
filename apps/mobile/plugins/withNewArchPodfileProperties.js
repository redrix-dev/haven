/**
 * Ensures `ios/Podfile.properties.json` sets `newArchEnabled` to `"true"`.
 * The Podfile reads this into `ENV['RCT_NEW_ARCH_ENABLED']`; `"false"` breaks
 * react-native-reanimated (and matches nothing we want on SDK 55).
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
      if (json.newArchEnabled === "true") {
        return cfg;
      }
      json.newArchEnabled = "true";
      fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
      return cfg;
    },
  ]);
}

module.exports = withNewArchPodfileProperties;
