import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function JoinPlaceholderScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border-panel bg-surface-modal px-3 py-3">
        <Pressable
          accessibilityRole="button"
          className="mr-2 h-10 w-10 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#e6edf7" />
        </Pressable>
        <Text className="text-lg font-semibold text-foreground">Join community</Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-muted-foreground">Coming soon.</Text>
      </View>
    </View>
  );
}
