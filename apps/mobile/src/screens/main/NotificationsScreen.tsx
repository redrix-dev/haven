import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiStore } from "@shared/stores/uiStore";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";
import NotificationsContainer from "@/features/notifications/NotificationsContainer";
import type { NotificationsFriendsPanelOpenInput } from "@/features/notifications/NotificationsContainer";
import type { MainStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      useUiStore.getState().setNotificationsPanelOpen(true);
      return () => {
        useUiStore.getState().setNotificationsPanelOpen(false);
      };
    }, []),
  );

  const handleOpenFriendsPanel = useCallback((input: NotificationsFriendsPanelOpenInput) => {
    useMobilePushNavigationStore.getState().handlers?.openFriends(input);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }} className="border-b border-border-panel bg-surface-panel">
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={navigation.goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="rounded-xl p-2 active:bg-surface-hover"
          >
            <Ionicons name="chevron-back" size={24} color="#e6edf7" />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Notifications</Text>
        </View>
      </View>
      <View className="flex-1 p-4">
        <NotificationsContainer onOpenFriendsPanel={handleOpenFriendsPanel} />
      </View>
    </View>
  );
}
