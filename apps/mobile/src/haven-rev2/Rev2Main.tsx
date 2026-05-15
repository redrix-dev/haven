import { View } from "react-native";
import { MobileDirectMessagesProvider } from "@/contexts/MobileDirectMessagesContext";
import { MobileNotificationsProvider } from "@/contexts/MobileNotificationsContext";
import { MobileSocialWorkspaceProvider } from "@/contexts/MobileSocialWorkspaceContext";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { useMobileCommunityPermissionsHydration } from "@/hooks/useMobileCommunityPermissionsHydration";
import { Spinner } from "@/components/ui/spinner";
import { Rev2DrawerNavigator } from "@/haven-rev2/navigation/Rev2DrawerNavigator";
import { DMBubbleHost } from "@/haven-rev2/components/DMBubbleHost";

/**
 * haven-rev2 shell: same data providers as legacy MainTabs, plus DM hook always active for bubble sheet.
 * Mount via RootNavigator when `USE_HAVEN_REV2` is true (see haven-rev2/README.md).
 */
export function Rev2Main() {
  const session = useAuthSession();
  const userId = session?.user?.id;
  useMobileCommunityPermissionsHydration(userId);
  useHydrateMobileThemeFromProfile(userId);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <Spinner size="large" colorClassName="accent-foreground" />
      </View>
    );
  }

  return (
    <MobileNotificationsProvider userId={userId}>
      <MobileSocialWorkspaceProvider userId={userId}>
        <MobileDirectMessagesProvider userId={userId} isDmWorkspaceAlwaysActive>
          <View style={{ flex: 1 }} collapsable={false}>
            <Rev2DrawerNavigator />
            <DMBubbleHost />
          </View>
        </MobileDirectMessagesProvider>
      </MobileSocialWorkspaceProvider>
    </MobileNotificationsProvider>
  );
}
