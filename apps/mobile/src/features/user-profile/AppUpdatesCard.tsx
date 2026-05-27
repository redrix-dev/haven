import { ThemedIonicons } from "@/theme-rn";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

function formatDate(value: Date | undefined | null): string {
  if (!value) return "Unknown";
  return value.toLocaleString();
}

function formatProgress(value: number | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function formatUpdateId(value: string | undefined): string {
  if (!value) return "Embedded";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function getNoUpdateReasonLabel(reason: string | undefined): string {
  switch (reason) {
    case "noUpdateAvailableOnServer":
      return "No update available on the server.";
    case "updateRejectedBySelectionPolicy":
      return "An update exists, but this build rejected it.";
    case "updatePreviouslyFailed":
      return "The newest matching update previously failed on this device.";
    case "rollbackRejectedBySelectionPolicy":
      return "A rollback was offered, but this build rejected it.";
    case "rollbackNoEmbeddedConfiguration":
      return "A rollback was offered, but this build has no valid embedded fallback.";
    default:
      return "No new update available right now.";
  }
}

type InfoRowProps = {
  label: string;
  value: string;
  mono?: boolean;
};

function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
    <View className="flex-row items-start gap-3">
      <Text className="w-24 text-[#8E8E93] text-[12px] font-semibold">{label}</Text>
      <Text
        className={`flex-1 text-foreground text-[13px] ${mono ? "font-mono" : ""}`}
        selectable={mono}
      >
        {value}
      </Text>
    </View>
  );
}

export default function AppUpdatesCard() {
  const {
    availableUpdate,
    currentlyRunning,
    downloadedUpdate,
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
    downloadProgress,
    lastCheckForUpdateTimeSinceRestart,
  } = Updates.useUpdates();

  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const [isManuallyChecking, setIsManuallyChecking] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "Unknown";
  const nativeBuild =
    Constants.platform?.ios?.buildNumber ??
    (typeof Constants.platform?.android?.versionCode === "number"
      ? String(Constants.platform.android.versionCode)
      : null) ??
    "Unknown";
  const runtimeVersion =
    Updates.runtimeVersion ??
    currentlyRunning.runtimeVersion ??
    Constants.expoRuntimeVersion ??
    "Unknown";
  const configuredChannel =
    (
      Constants.expoConfig?.updates as
        | { requestHeaders?: Record<string, string | undefined> }
        | undefined
    )?.requestHeaders?.["expo-channel-name"] ?? "production";
  const channel = currentlyRunning.channel ?? configuredChannel;

  const latestError = downloadError ?? checkError ?? null;

  const statusLabel = useMemo(() => {
    if (!Updates.isEnabled) {
      return "OTA updates are disabled in this build.";
    }
    if (isUpdatePending) {
      return "A downloaded update is ready to apply.";
    }
    if (isDownloading) {
      const progressLabel = formatProgress(downloadProgress);
      return progressLabel ? `Downloading update (${progressLabel})…` : "Downloading update…";
    }
    if (isChecking || isManuallyChecking) {
      return "Checking for updates…";
    }
    if (latestError) {
      return latestError.message || "The last update attempt failed.";
    }
    if (manualStatus) {
      return manualStatus;
    }
    if (!currentlyRunning.isEmbeddedLaunch) {
      return "Running a downloaded OTA update.";
    }
    return "Running the embedded build.";
  }, [
    checkError,
    currentlyRunning.isEmbeddedLaunch,
    downloadError,
    downloadProgress,
    isChecking,
    isDownloading,
    isManuallyChecking,
    isUpdatePending,
    latestError,
    manualStatus,
  ]);

  const handleReload = useCallback(() => {
    Alert.alert("Apply downloaded update?", "Restart the app now to run the downloaded OTA?", [
      { text: "Later", style: "cancel" },
      {
        text: "Restart now",
        onPress: () => {
          void Updates.reloadAsync();
        },
      },
    ]);
  }, []);

  const handleCheckNow = useCallback(async () => {
    if (!Updates.isEnabled) {
      Alert.alert(
        "Updates unavailable",
        "This build does not have Expo OTA updates enabled, so manual recheck is unavailable.",
      );
      return;
    }

    setIsManuallyChecking(true);
    setManualStatus(null);

    try {
      const checkResult = await Updates.checkForUpdateAsync();

      if (checkResult.isRollBackToEmbedded) {
        setManualStatus("A rollback to the embedded build is available.");
        Alert.alert(
          "Rollback available",
          "The server offered a rollback to the embedded build instead of a newer OTA.",
        );
        return;
      }

      if (!checkResult.isAvailable) {
        setManualStatus(getNoUpdateReasonLabel(checkResult.reason));
        return;
      }

      setManualStatus("Update found. Downloading…");
      const fetchResult = await Updates.fetchUpdateAsync();

      if (fetchResult.isRollBackToEmbedded) {
        setManualStatus("Rollback downloaded. Restart to apply.");
        Alert.alert(
          "Rollback ready",
          "A rollback to the embedded build was downloaded. Restart now to apply it?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Restart now",
              onPress: () => {
                void Updates.reloadAsync();
              },
            },
          ],
        );
        return;
      }

      if (fetchResult.isNew) {
        const updateId =
          "id" in fetchResult.manifest && typeof fetchResult.manifest.id === "string"
            ? fetchResult.manifest.id
            : undefined;
        setManualStatus(
          updateId
            ? `Update downloaded (${formatUpdateId(updateId)}). Restart to apply.`
            : "Update downloaded. Restart to apply.",
        );
        Alert.alert("Update ready", "A new OTA update was downloaded. Restart now to apply it?", [
          { text: "Later", style: "cancel" },
          {
            text: "Restart now",
            onPress: () => {
              void Updates.reloadAsync();
            },
          },
        ]);
        return;
      }

      setManualStatus("Checked successfully, but nothing new was downloaded.");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not check for updates.";
      setManualStatus(message);
      Alert.alert("Update check failed", message);
    } finally {
      setIsManuallyChecking(false);
    }
  }, []);

  const primaryActionLabel = isUpdatePending
    ? "Restart to Apply Update"
    : isChecking || isDownloading || isManuallyChecking
      ? "Checking…"
      : "Check for Updates";

  const primaryActionDisabled = isChecking || isDownloading || isManuallyChecking;

  return (
    <View className="rounded-2xl bg-[#1C1C1E] px-4 py-3 gap-3">
      <View className="flex-row items-center gap-2">
        <ThemedIonicons name="cloud-download-outline" size={18} colorClassName="accent-muted-foreground" />
        <Text className="text-foreground text-[16px] font-semibold">App Updates</Text>
      </View>

      <View className="gap-2.5">
        <InfoRow label="Version" value={`${appVersion} (${nativeBuild})`} />
        <InfoRow label="Runtime" value={runtimeVersion} mono />
        <InfoRow label="Channel" value={channel} mono />
        <InfoRow
          label="Current OTA"
          value={formatUpdateId(currentlyRunning.updateId)}
          mono
        />
        <InfoRow
          label="Launch Source"
          value={currentlyRunning.isEmbeddedLaunch ? "Embedded binary" : "Downloaded OTA"}
        />
        <InfoRow
          label="Created"
          value={formatDate(currentlyRunning.createdAt)}
        />
        <InfoRow
          label="Last Check"
          value={formatDate(lastCheckForUpdateTimeSinceRestart)}
        />
        {availableUpdate || downloadedUpdate ? (
          <InfoRow
            label="Available OTA"
            value={formatUpdateId(
              (downloadedUpdate &&
                "updateId" in downloadedUpdate &&
                typeof downloadedUpdate.updateId === "string"
                ? downloadedUpdate.updateId
                : undefined) ||
                (availableUpdate &&
                "updateId" in availableUpdate &&
                typeof availableUpdate.updateId === "string"
                  ? availableUpdate.updateId
                  : undefined),
            )}
            mono
          />
        ) : null}
      </View>

      <View className="rounded-xl bg-[#2C2C2E] px-3 py-2.5">
        <Text className="text-[#C7C7CC] text-[12px] leading-5">{statusLabel}</Text>
      </View>

      <Pressable
        onPress={() => void (isUpdatePending ? handleReload() : handleCheckNow())}
        disabled={primaryActionDisabled}
        accessibilityRole="button"
        accessibilityLabel={primaryActionLabel}
        className={`rounded-xl py-2.5 items-center justify-center ${
          primaryActionDisabled ? "bg-[#3A3A3C] opacity-70" : "bg-[#0A84FF]"
        }`}
      >
        <Text className="text-foreground text-[15px] font-semibold">{primaryActionLabel}</Text>
      </Pressable>
    </View>
  );
}
