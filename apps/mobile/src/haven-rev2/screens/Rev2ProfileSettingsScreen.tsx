import { useCallback } from "react";
import { ScrollView } from "react-native";
import { Box } from "@/components/ui/box";
import UserSettingsContainer from "@/features/user-profile/UserSettingsContainer";
import { deleteOwnAccount, signOutFromAuth } from "@/auth/mobileAuthService";

/**
 * haven-rev2: profile + account + appearance (built-in themes) + OTA card — same data layer as legacy modal.
 */
export function Rev2ProfileSettingsScreen() {
  const handleSignOut = useCallback(async () => {
    await signOutFromAuth();
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    await deleteOwnAccount();
  }, []);

  return (
    <Box className="min-h-0 flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <UserSettingsContainer onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} />
      </ScrollView>
    </Box>
  );
}
