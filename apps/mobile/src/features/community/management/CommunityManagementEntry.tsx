import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ThemedIonicons } from "@/theme-rn";
import { CommunityManagementSheet } from "./CommunityManagementSheet";

/**
 * The way into a community's settings, at the foot of its channel drawer.
 * Everyone has it: the overview is where a member leaves; the other tabs
 * appear for those who may use them.
 */
export function CommunityManagementEntry({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View className="border-t border-border-panel px-3 pb-2 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Community settings"
          onPress={() => setOpen(true)}
          className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 active:bg-surface-hover"
        >
          <ThemedIonicons
            name="settings-outline"
            size={16}
            colorClassName="accent-text-dim"
          />
          <Text className="flex-1 text-sm font-medium text-muted-foreground">
            Community settings
          </Text>
        </Pressable>
      </View>
      <CommunityManagementSheet
        visible={open}
        communityId={serverId}
        onDismiss={() => setOpen(false)}
      />
    </>
  );
}
