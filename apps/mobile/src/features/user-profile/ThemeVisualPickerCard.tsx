import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { ThemedIonicons } from "@/theme-rn";
import { useCallback, useState } from "react";
import { useHavenCore } from "@shared/core";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { listSelectableBuiltinThemes } from "@shared/themes/selectableBuiltinThemes";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";
import { applyMobileTheme, normalizeMobileThemeId } from "@/lib/theme";

type ThemeSwatch = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  primary: string;
};

// Computed once at module load — these are static values from the built-in theme registry.
// Intentional: inline style colors here show each theme's own palette, not the active theme.
const SWATCHES: ThemeSwatch[] = listSelectableBuiltinThemes(new Set<string>()).map((theme) => ({
  id: theme.id,
  name: theme.name,
  bg: (theme.tokens["surface-1"] as string) ?? "#111a2b",
  surface: (theme.tokens["surface-3"] as string) ?? "#16233a",
  primary: (theme.tokens["primary"] as string) ?? "#3f79d8",
}));

type ThemeVisualPickerCardProps = {
  userId: string | null;
  username: string;
  avatarUrl: string | null;
};

export function ThemeVisualPickerCard({ userId, username, avatarUrl }: ThemeVisualPickerCardProps) {
  const core = useHavenCore();
  const selectedThemeId = useMobileThemePreferenceStore((s) => s.selectedThemeId);
  const setSelectedThemeId = useMobileThemePreferenceStore((s) => s.setSelectedThemeId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    async (themeId: string) => {
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
        await core.updateUserProfile({ userId, username: trimmedName, avatarUrl, theme: themeId });
      } catch (error) {
        setSelectedThemeId(previousId);
        applyMobileTheme(normalizeMobileThemeId(previousId));
        Alert.alert("Could not save theme", getErrorMessage(error, "Something went wrong. Try again."));
      } finally {
        setPendingId(null);
      }
    },
    [core, userId, username, avatarUrl, pendingId, selectedThemeId, setSelectedThemeId],
  );

  const renderItem = useCallback(
    ({ item: swatch }: { item: ThemeSwatch }) => {
      const isSelected = swatch.id === selectedThemeId;
      const isBusy = pendingId === swatch.id;
      const isDisabled = !userId || Boolean(pendingId);

      return (
        <Pressable
          onPress={() => void handleSelect(swatch.id)}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Select ${swatch.name} theme`}
          accessibilityState={{ selected: isSelected }}
          style={{ flex: 1 }}
          className={pendingId && !isBusy ? "opacity-50" : "opacity-100"}
        >
          <View
            style={{
              backgroundColor: swatch.bg,
              borderWidth: 2,
              borderColor: isSelected ? swatch.primary : "transparent",
              borderRadius: 16,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: swatch.surface, width: 22, height: 22, borderRadius: 11 }} />
              <View style={{ backgroundColor: swatch.primary, width: 22, height: 22, borderRadius: 11 }} />
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: swatch.primary,
                  backgroundColor: swatch.bg,
                }}
              />
            </View>
            {isBusy ? (
              <ActivityIndicator size="small" color={swatch.primary} />
            ) : (
              <View style={{ height: 14 }} />
            )}
          </View>
          <Text
            className="mt-1.5 text-center text-xs font-medium text-muted-foreground"
            numberOfLines={1}
          >
            {swatch.name}
          </Text>
        </Pressable>
      );
    },
    [handleSelect, pendingId, selectedThemeId, userId],
  );

  return (
    <View className="overflow-hidden rounded-2xl border border-border-panel bg-card">
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={isOpen ? "Collapse appearance" : "Expand appearance"}
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center justify-between px-4 py-3.5 active:bg-surface-hover"
      >
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Appearance
        </Text>
        <ThemedIonicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={16}
          colorClassName="accent-muted-foreground"
        />
      </Pressable>
      {isOpen ? (
        <FlatList
          data={SWATCHES}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          scrollEnabled={false}
          style={{ paddingBottom: 12 }}
        />
      ) : null}
    </View>
  );
}
