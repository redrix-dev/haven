import { builtinThemes } from "@shared/themes";
import { useMemo, useState } from "react";
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView,
  ActionsheetSectionHeaderText,
} from "@/components/ui/actionsheet";
import { Fab, FabLabel } from "@/components/ui/fab";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
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
      <Fab
        size="sm"
        placement="bottom right"
        className="bottom-8 right-5"
        onPress={() => setIsOpen(true)}
      >
        <FabLabel>Theme</FabLabel>
      </Fab>

      <Actionsheet isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <ActionsheetBackdrop />
        <ActionsheetContent>
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>

          <VStack space="xs" className="w-full px-3 pb-2">
            <Text size="lg" bold className="text-foreground">
              Dev Theme
            </Text>
            <Text size="sm" className="text-muted-foreground">
              Session only. Current: {selectedThemeName}
            </Text>
          </VStack>

          <ActionsheetSectionHeaderText>Themes</ActionsheetSectionHeaderText>

          <ActionsheetScrollView>
            {themeOptions.map((theme) => (
              <ActionsheetItem
                key={theme.id}
                onPress={() => selectTheme(theme.id)}
              >
                <ActionsheetItemText bold={theme.id === sessionThemeId}>
                  {theme.name}
                </ActionsheetItemText>
              </ActionsheetItem>
            ))}

            <ActionsheetItem onPress={restorePersistedTheme}>
              <ActionsheetItemText>
                Restore saved preference
              </ActionsheetItemText>
            </ActionsheetItem>
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>
    </>
  );
}
