import { SafeAreaView } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { Box } from "@/components/ui/box";
import { UxLabChannelSwitcher } from "./components/UxLabChannelSwitcher";
import { UxLabCommunitySwitcher } from "./components/UxLabCommunitySwitcher";
import { UxLabNavBar } from "./components/UxLabNavBar";
import { UxLabQuickActions } from "./components/UxLabQuickActions";
import { UxLabCommunityScreen } from "./screens/UxLabCommunityScreen";
import { UxLabDirectMessagesScreen } from "./screens/UxLabDirectMessagesScreen";
import { UxLabFriendsScreen } from "./screens/UxLabFriendsScreen";
import { UxLabHomeScreen } from "./screens/UxLabHomeScreen";
import { UxLabNotificationsScreen } from "./screens/UxLabNotificationsScreen";
import { UxLabProfileScreen } from "./screens/UxLabProfileScreen";
import { UxLabSettingsScreen } from "./screens/UxLabSettingsScreen";
import { UxLabThemeSpecimenScreen } from "./screens/UxLabThemeSpecimenScreen";
import { useUxLabStore } from "./UxLabStore";

export function UxLabRoot() {
  const activeSurface = useUxLabStore((s) => s.activeSurface);
  const safeAreaStyle = useResolveClassNames("bg-background");

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[{ flex: 1 }, safeAreaStyle]}
    >
      <Box className="flex-1 bg-background">
        <Box className="min-h-0 flex-1">
          {activeSurface === "home" ? <UxLabHomeScreen /> : null}
          {activeSurface === "community" ? <UxLabCommunityScreen /> : null}
          {activeSurface === "dms" ? <UxLabDirectMessagesScreen /> : null}
          {activeSurface === "friends" ? <UxLabFriendsScreen /> : null}
          {activeSurface === "notifications" ? (
            <UxLabNotificationsScreen />
          ) : null}
          {activeSurface === "settings" ? <UxLabSettingsScreen /> : null}
          {activeSurface === "profile" ? <UxLabProfileScreen /> : null}
          {activeSurface === "themeSpecimen" ? (
            <UxLabThemeSpecimenScreen />
          ) : null}
        </Box>
        <UxLabNavBar />
        <UxLabCommunitySwitcher />
        <UxLabChannelSwitcher />
        <UxLabQuickActions />
      </Box>
    </SafeAreaView>
  );
}
