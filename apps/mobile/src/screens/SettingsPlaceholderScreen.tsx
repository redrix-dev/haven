import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileSupabase } from "../supabase/getMobileSupabase";

export function SettingsPlaceholderScreen() {
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
        <Text className="text-lg font-semibold text-foreground">
          Account & settings
        </Text>
      </View>
      <View className="flex-1 justify-center px-6">
        <Text className="mb-8 text-center text-muted-foreground">
          Settings and account management will live here.
        </Text>
        <Pressable
          className="rounded-xl border border-border-control py-4 active:bg-surface-embedded"
          onPress={() => void getMobileSupabase().auth.signOut()}
        >
          <Text className="text-center text-base font-semibold text-foreground">
            Sign out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
