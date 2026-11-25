import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { perfTrace } from "@shared/debug/perfTrace";
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
    const report = perfTrace.getReport();
    console.log("\n" + report);
    const events = perfTrace.getEvents();
    const total = events[events.length - 1]?.elapsed ?? 0;
    Alert.alert(
      "Perf trace",
      `${events.length} events · ${total.toFixed(0)} ms since js-entry\n\nFilter device logs on haven-perf. The table was printed to the console.`,
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
