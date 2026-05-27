import { builtinThemes } from "@shared/themes";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { applyMobileTheme } from "@/lib/theme";
import { useMobileThemePreferenceStore } from "@/stores/mobileThemePreferenceStore";

const themeOptions = Object.values(builtinThemes).filter(
  (theme) => theme.status !== "disabled",
);

export function MobileDevThemeMenu() {
  const persistedThemeId = useMobileThemePreferenceStore(
    (s) => s.selectedThemeId,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [sessionThemeId, setSessionThemeId] = useState(persistedThemeId);

  const selectedThemeName = useMemo(() => {
    return (
      themeOptions.find((theme) => theme.id === sessionThemeId)?.name ??
      sessionThemeId
    );
  }, [sessionThemeId]);

  if (!__DEV__) {
    return null;
  }

  const selectTheme = (themeId: string) => {
    const normalizedThemeId = applyMobileTheme(themeId);
    setSessionThemeId(normalizedThemeId);
    setIsOpen(false);
  };

  const restorePersistedTheme = () => {
    const normalizedThemeId = applyMobileTheme(persistedThemeId);
    setSessionThemeId(normalizedThemeId);
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        className="absolute bottom-8 right-5 rounded-full bg-primary px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel="Dev theme menu"
      >
        <Text className="text-sm font-semibold text-primary-foreground">Theme</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsOpen(false)}
      >
        {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - dev-only modal scrim overlay */}
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setIsOpen(false)}>
          <Pressable
            className="max-h-[70%] rounded-t-2xl bg-surface-modal pb-8"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="px-4 pb-2 pt-4">
              <Text className="text-lg font-bold text-foreground">Dev Theme</Text>
              <Text className="text-sm text-muted-foreground">
                Session only. Current: {selectedThemeName}
              </Text>
            </View>
            <ScrollView>
              {themeOptions.map((theme) => (
                <Pressable
                  key={theme.id}
                  onPress={() => selectTheme(theme.id)}
                  className="border-b border-border px-4 py-3"
                >
                  <Text
                    className={`text-base text-foreground ${
                      theme.id === sessionThemeId ? "font-bold" : "font-normal"
                    }`}
                  >
                    {theme.name}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={restorePersistedTheme}
                className="px-4 py-3"
              >
                <Text className="text-base text-foreground">
                  Restore saved preference
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
