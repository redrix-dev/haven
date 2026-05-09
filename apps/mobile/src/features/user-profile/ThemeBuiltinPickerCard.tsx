import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@platform/lib/errors";
import { builtinThemes } from "@shared/themes/registry";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

type ThemeBuiltinPickerCardProps = {
  userId: string | null;
  username: string;
  avatarUrl: string | null;
};

export function ThemeBuiltinPickerCard({
  userId,
  username,
  avatarUrl,
}: ThemeBuiltinPickerCardProps) {
  const selectedThemeId = useMobileThemePreferenceStore((s) => s.selectedThemeId);
  const setSelectedThemeId = useMobileThemePreferenceStore((s) => s.setSelectedThemeId);

  const selectableThemes = useMemo(
    () => Object.values(builtinThemes).filter((t) => t.status !== "preview"),
    [],
  );

  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleSelect = async (themeId: string) => {
    if (!userId || pendingId) return;
    const trimmedName = username.trim();
    if (!trimmedName) {
      Alert.alert("Username required", "Set a username before changing theme.");
      return;
    }

    const previousId = selectedThemeId;
    setPendingId(themeId);
    setSelectedThemeId(themeId);

    try {
      const backend = getControlPlaneBackend();
      await backend.updateUserProfile({
        userId,
        username: trimmedName,
        avatarUrl,
        theme: themeId,
      });
    } catch (error) {
      setSelectedThemeId(previousId);
      Alert.alert(
        "Could not save theme",
        getErrorMessage(error, "Something went wrong. Try again."),
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <View className="rounded-2xl bg-[#1C1C1E] overflow-hidden">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-xs font-medium uppercase tracking-wide text-[#8E8E93]">
          Appearance
        </Text>
      </View>
      {selectableThemes.map((theme, index) => {
        const isLast = index === selectableThemes.length - 1;
        const selected = theme.id === selectedThemeId;
        const busy = pendingId === theme.id;

        return (
          <Pressable
            key={theme.id}
            onPress={() => void handleSelect(theme.id)}
            disabled={!userId || Boolean(pendingId)}
            accessibilityRole="button"
            accessibilityLabel={`Theme ${theme.name}`}
            accessibilityState={{ selected }}
            className={`flex-row items-center gap-2.5 px-4 py-3 ${
              pendingId && pendingId !== theme.id ? "opacity-50" : "opacity-100"
            } ${isLast ? "" : "border-b border-[#2C2C2E]"}`}
          >
            <View className="flex-1">
              <Text style={{ color: "#FFFFFF" }} className="text-base font-medium">
                {theme.name}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color="#8E8E93" size="small" />
            ) : selected ? (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
