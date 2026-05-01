import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "@/navigation/types";

type HavenNavbarProps = {
  onPressSettings?: () => void;
  onPressNotifications?: () => void;
  onPressDirectMessages?: () => void;
  onPressFriends?: () => void;
};

const goHome = (navigation: NativeStackNavigationProp<RootStackParamList>) =>
  navigation.dispatch(
    CommonActions.navigate({ name: "Main", params: { screen: "Home" } }),
  );

export function HavenNavbar({
  onPressSettings,
  onPressNotifications,
  onPressDirectMessages,
  onPressFriends,
}: HavenNavbarProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
            else goHome(navigation);
          })}
          {iconBtn("home", () => goHome(navigation))}
          {iconBtn("people", onPressFriends ?? (() => undefined))}
        </View>
        <Text className="absolute left-0 right-0 text-center text-lg font-semibold text-foreground">
          Haven
        </Text>
        <View className="z-10 flex-row gap-2">
          {iconBtn("notifications-outline", onPressNotifications ?? (() => undefined))}
          {iconBtn("chatbubble-outline", onPressDirectMessages ?? (() => undefined))}
          {iconBtn("cog-outline", onPressSettings ?? (() => undefined))}
        </View>
      </View>
    </View>
  );
}
