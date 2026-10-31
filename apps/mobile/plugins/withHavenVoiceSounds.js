const fs = require("node:fs");
const path = require("node:path");
const {
  withXcodeProject,
  withMainApplication,
  withDangerousMod,
} = require("expo/config-plugins");
const { getProjectName, addBuildSourceFileToGroup } = require(
  require.resolve("@expo/config-plugins/build/ios/utils/Xcodeproj", {
    paths: [path.join(__dirname, "../node_modules/expo")],
  }),
);
const templates = path.join(__dirname, "voice-sound-templates");

module.exports = function withHavenVoiceSounds(config) {
  config = withXcodeProject(config, (cfg) => {
    const name = getProjectName(cfg.modRequest.projectRoot);
    const relative = path.join(name, "HavenVoiceSounds.m");
    const destination = path.join(cfg.modRequest.platformProjectRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(templates, "HavenVoiceSounds.m"), destination);
    if (
      !cfg.modResults.hasFile(relative) &&
      !cfg.modResults.hasFile("HavenVoiceSounds.m")
    ) {
      addBuildSourceFileToGroup({
        filepath: relative,
        groupName: name,
        project: cfg.modResults,
        verbose: false,
      });
    }
    return cfg;
  });
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android.package;
      if (!pkg) throw new Error("Voice sounds require android.package");
      const destination = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/java",
        ...pkg.split("."),
        "HavenVoiceSoundsPackage.kt",
      );
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(
        destination,
        fs
          .readFileSync(
            path.join(templates, "HavenVoiceSoundsPackage.kt"),
            "utf8",
          )
          .replace("__PACKAGE__", pkg),
      );
      return cfg;
    },
  ]);
  return withMainApplication(config, (cfg) => {
    if (!cfg.modResults.contents.includes("add(HavenVoiceSoundsPackage())")) {
      const anchor = "PackageList(this).packages.apply {";
      if (!cfg.modResults.contents.includes(anchor))
        throw new Error(
          "Voice sounds: MainApplication package registration changed; inspect the Expo template.",
        );
      cfg.modResults.contents = cfg.modResults.contents.replace(
        anchor,
        `${anchor}\n              add(HavenVoiceSoundsPackage())`,
      );
    }
    return cfg;
  });
};
