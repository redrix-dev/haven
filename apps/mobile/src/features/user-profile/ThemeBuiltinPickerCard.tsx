import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@platform/lib/errors";
import { listSelectableBuiltinThemes } from "@shared/themes/selectableBuiltinThemes";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";
import { ThemedIonicons } from "@/theme-rn";
import { applyMobileTheme, normalizeMobileThemeId } from "@/lib/theme";

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
    () => listSelectableBuiltinThemes(new Set<string>()),
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
    applyMobileTheme(themeId);

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
      applyMobileTheme(normalizeMobileThemeId(previousId));
      Alert.alert(
        "Could not save theme",
        getErrorMessage(error, "Something went wrong. Try again."),
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="px-4 pb-2 pt-3">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
            } ${isLast ? "" : "border-b border-border"}`}
          >
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">{theme.name}</Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color="#a9b8cf" />
            ) : selected ? (
              <ThemedIonicons name="checkmark" size={20} colorClassName="accent-primary" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
