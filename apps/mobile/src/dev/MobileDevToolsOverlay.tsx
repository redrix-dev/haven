import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { bootLogger } from "@shared/debug/bootLogger";
import { DataCacheDebugModal } from "@/debug/DataCacheDebugModal";
import { MobileDevThemeMenu } from "@/dev/MobileDevThemeMenu";

/**
 * Dev-only floating controls: theme picker + data cache debug modal launcher
 * + boot sequence timing log.
 */
export function MobileDevToolsOverlay() {
  const [dataDebugOpen, setDataDebugOpen] = useState(false);

  if (!__DEV__) return null;

  const showBootLog = () => {
    const report = bootLogger.getReport();
    // Print to Metro/console for full detail, show summary in Alert.

    console.log("\n" + report);
    const events = bootLogger.getEvents();
    const total = events[events.length - 1]?.elapsed ?? 0;
    Alert.alert(
      "Boot Sequence",
      `${events.length} events · ${total.toFixed(0)} ms total\n\nFull report printed to console.`,
      [{ text: "OK" }],
    );
  };

  return (
    <>
      <View className="absolute bottom-24 right-5 gap-2">
        <Pressable
          onPress={showBootLog}
          className="rounded-full bg-surface-panel px-4 py-3 active:bg-surface-hover"
          accessibilityRole="button"
          accessibilityLabel="Boot log"
        >
          <Text className="text-sm font-semibold text-foreground">Boot</Text>
        </Pressable>

        <Pressable
          onPress={() => setDataDebugOpen(true)}
          className="rounded-full bg-primary px-4 py-3 active:bg-primary-hover"
          accessibilityRole="button"
          accessibilityLabel="Data cache debug"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            Data
          </Text>
        </Pressable>
      </View>

      <MobileDevThemeMenu />

      <DataCacheDebugModal
        visible={dataDebugOpen}
        onClose={() => setDataDebugOpen(false)}
      />
    </>
  );
}
