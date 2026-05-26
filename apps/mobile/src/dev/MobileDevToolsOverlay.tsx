import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { DataCacheDebugModal } from "@/debug/DataCacheDebugModal";
import { MobileDevThemeMenu } from "@/dev/MobileDevThemeMenu";

/**
 * Dev-only floating controls: theme picker + data cache debug modal launcher.
 */
export function MobileDevToolsOverlay() {
  const [dataDebugOpen, setDataDebugOpen] = useState(false);

  if (!__DEV__) return null;

  return (
    <>
      <View className="absolute bottom-24 right-5">
        <Pressable
          onPress={() => setDataDebugOpen(true)}
          className="rounded-full bg-primary px-4 py-3 active:bg-primary-hover"
          accessibilityRole="button"
          accessibilityLabel="Data cache debug"
        >
          <Text className="text-sm font-semibold text-primary-foreground">Data</Text>
        </Pressable>
      </View>

      <MobileDevThemeMenu />

      <DataCacheDebugModal visible={dataDebugOpen} onClose={() => setDataDebugOpen(false)} />
    </>
  );
}
