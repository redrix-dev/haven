import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";

export function HavenNavbar() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, "Home">>();

  const iconBtn = (
    name: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
      onPress={onPress}
    >
      <Ionicons name={name} size={22} color="#e6edf7" />
    </Pressable>
  );

  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center justify-between px-3 pb-3">
        <View className="z-10 flex-row gap-2">
          {iconBtn("chevron-back", () => {
            if (navigation.canGoBack()) navigation.goBack();
          })}
          {iconBtn("home", () => navigation.navigate("Home"))}
          {iconBtn("people", () => undefined)}
        </View>
        <Text className="absolute left-0 right-0 text-center text-lg font-semibold text-foreground">
          Haven
        </Text>
        <View className="z-10 flex-row gap-2">
          {iconBtn("notifications-outline", () => undefined)}
          {iconBtn("chatbubble-outline", () => undefined)}
          {iconBtn("cog-outline", () => navigation.navigate("SettingsPlaceholder"))}
        </View>
      </View>
    </View>
  );
}