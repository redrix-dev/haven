/**
 * Raises every Pod target's IPHONEOS_DEPLOYMENT_TARGET to the app's own
 * deployment target when a pod asks for less.
 *
 * Xcode 27 treats a deployment target below its supported range (15.0+) as a
 * build error, not a warning. Several pods still declare older targets
 * (ReachabilitySwift 12.0, iosMath 6.0, RNSVG 12.4, RNCAsyncStorage 13.4), so
 * the build fails in the Pods project before the app compiles. Raising a
 * pod's floor to the app's never changes what devices the app supports: the
 * app target already requires the higher version.
 *
 * Idempotent: the marker comment keeps a second prebuild from adding it twice.
 */
const { withPodfile } = require("expo/config-plugins");

const MARKER = "# haven: pod deployment target floor";

const SNIPPET = `
    ${MARKER}
    floor = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new(floor)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor
        end
      end
    end`;

function withPodDeploymentTargetFloor(config) {
  return withPodfile(config, (cfg) => {
    const podfile = cfg.modResults.contents;
    if (podfile.includes(MARKER)) return cfg;

    // Insert after react_native_post_install(...) closes inside post_install.
    const anchor =
      /(post_install do \|installer\|\n\s*react_native_post_install\([\s\S]*?\n\s*\))/;
    if (!anchor.test(podfile)) {
      throw new Error(
        "withPodDeploymentTargetFloor: react_native_post_install not found in the Podfile",
      );
    }
    cfg.modResults.contents = podfile.replace(anchor, `$1${SNIPPET}`);
    return cfg;
  });
}

module.exports = withPodDeploymentTargetFloor;
