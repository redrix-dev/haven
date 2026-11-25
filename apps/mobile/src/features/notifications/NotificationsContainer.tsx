import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedIonicons } from "@/theme-rn";
import { useHavenCore, useStore } from "@mobile-data";
import { NotificationInboxList } from "@/features/notifications/NotificationInboxList";
import { NotificationPreferencesPanel } from "@/features/notifications/NotificationPreferencesPanel";

/**
 * The inbox and its preferences. Opening the inbox marks everything seen,
 * which clears the badge.
 */
export default function NotificationsContainer() {
  const core = useHavenCore();
  const [subScreen, setSubScreen] = useState<"list" | "preferences">("list");
  const unseen = useStore("notifications", (s) => s.unseen);
  const anyUnread = useStore("notifications", (s) =>
    (s.inbox?.ids ?? []).some((id) => s.byId[id]?.read_at === null),
  );

  useEffect(() => {
    if (unseen > 0) void core.notifications.mark("seen").catch(() => {});
  }, [core, unseen]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (subScreen === "preferences") {
          setSubScreen("list");
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [subScreen]),
  );

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-4 flex-row items-center justify-between">
        {subScreen === "preferences" ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setSubScreen("list")}
            className="flex-row items-center gap-2 active:opacity-80"
          >
            <ThemedIonicons
              name="chevron-back"
              size={22}
              colorClassName="accent-foreground"
            />
            <Text className="text-lg font-semibold text-foreground">
              Preferences
            </Text>
          </Pressable>
        ) : (
          <>
            <Text className="text-lg font-semibold text-foreground">
              Notifications
            </Text>
            <View className="flex-row items-center gap-2">
              {anyUnread ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    void core.notifications.mark("read").catch(() => {})
                  }
                  className="rounded-xl bg-surface-panel px-3 py-2 active:bg-surface-hover"
                >
                  <Text className="text-xs font-semibold text-foreground">
                    Mark all read
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notification preferences"
                hitSlop={10}
                onPress={() => setSubScreen("preferences")}
                className="rounded-xl bg-surface-panel p-2 active:bg-surface-hover"
              >
                <ThemedIonicons
                  name="settings-outline"
                  size={22}
                  colorClassName="accent-foreground"
                />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {subScreen === "preferences" ? (
        <NotificationPreferencesPanel />
      ) : (
        <NotificationInboxList />
      )}
    </View>
  );
}
