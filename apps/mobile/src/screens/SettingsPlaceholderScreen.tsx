import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileSupabase } from "../supabase/getMobileSupabase";

export function SettingsPlaceholderScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-slate-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-slate-800 px-3 py-3">
        <Pressable
          accessibilityRole="button"
          className="mr-2 h-10 w-10 items-center justify-center rounded-xl bg-slate-800"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        <Text className="text-lg font-semibold text-slate-50">
          Account & settings
        </Text>
      </View>
      <View className="flex-1 justify-center px-6">
        <Text className="mb-8 text-center text-slate-400">
          Settings and account management will live here.
        </Text>
        <Pressable
          className="rounded-xl border border-slate-600 py-4 active:bg-slate-900"
          onPress={() => void getMobileSupabase().auth.signOut()}
        >
          <Text className="text-center text-base font-semibold text-slate-200">
            Sign out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
