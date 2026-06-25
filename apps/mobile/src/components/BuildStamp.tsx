import Constants from "expo-constants";
import * as Updates from "expo-updates";
import * as Clipboard from "expo-clipboard";
import { Alert, Pressable, Text } from "react-native";

/**
 * Pre-auth version stamp. Shows the marketing version + native build always, and
 * reveals/copies the full diagnostic (Application / Build / Runtime / Update /
 * Channel) on long-press — no login and no "check for updates" button required.
 *
 * Reads only from expo-constants + expo-updates (both compiled into the build),
 * so this stays OTA-deliverable.
 *
 * Field meanings:
 *  - Application: marketing version (app.json `version`)
 *  - Build:       native build number (CFBundleVersion) — bumps per TestFlight upload
 *  - Runtime:     OTA compatibility key (app.json `runtimeVersion`)
 *  - Update:      the running JS bundle — "embedded" or an OTA id (changes per OTA push)
 */
function formatUpdateDate(date: Date | null): string {
  if (!date) return "";
  try {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function BuildStamp() {
  const application = Constants.expoConfig?.version ?? "0.0.0";
  const build =
    Constants.platform?.ios?.buildNumber ??
    (typeof Constants.platform?.android?.versionCode === "number"
      ? String(Constants.platform.android.versionCode)
      : null) ??
    "—";
  const runtime = Updates.runtimeVersion ?? "—";
  const channel = Updates.channel ?? "—";
  const update = Updates.isEmbeddedLaunch
    ? "embedded"
    : `${(Updates.updateId ?? "unknown").slice(0, 8)}${
        Updates.createdAt ? ` · ${formatUpdateDate(Updates.createdAt)}` : ""
      }`;

  const onLongPress = async () => {
    const detail = [
      `Application: ${application}`,
      `Build: ${build}`,
      `Runtime: ${runtime}`,
      `Update: ${update}`,
      `Channel: ${channel}`,
    ].join("\n");
    try {
      await Clipboard.setStringAsync(detail);
      Alert.alert("Build info (copied)", detail);
    } catch {
      Alert.alert("Build info", detail);
    }
  };

  return (
    <Pressable onLongPress={onLongPress} hitSlop={8} accessibilityRole="text">
      <Text className="text-center text-xs text-muted-foreground">
        Haven {application} ({build})
      </Text>
    </Pressable>
  );
}
