import { Ionicons } from "@expo/vector-icons";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { Box } from "@/components/ui/box";
import { UxLabChannelScreen } from "../screens/UxLabChannelScreen";
import { UxLabDirectMessagesScreen } from "../screens/UxLabDirectMessagesScreen";
import { UxLabFriendsScreen } from "../screens/UxLabFriendsScreen";
import { UxLabHomeScreen } from "../screens/UxLabHomeScreen";
import { UxLabNotificationsScreen } from "../screens/UxLabNotificationsScreen";
import { UxLabProfileScreen } from "../screens/UxLabProfileScreen";
import { UxLabSettingsScreen } from "../screens/UxLabSettingsScreen";
import { UxLabThemeSpecimenScreen } from "../screens/UxLabThemeSpecimenScreen";
import { useUxLabThemeColors } from "../UxLabTheme";

export type UxLabMaterialTopTabParamList = {
  LabHome: undefined;
  LabCommunity: undefined;
  LabDms: undefined;
  LabFriends: undefined;
  LabNotifications: undefined;
  LabSettings: undefined;
  LabProfile: undefined;
  LabThemeSpecimen: undefined;
};

const TopTabs = createMaterialTopTabNavigator<UxLabMaterialTopTabParamList>();

const icons: Record<
  keyof UxLabMaterialTopTabParamList,
  keyof typeof Ionicons.glyphMap
> = {
  LabHome: "grid-outline",
  LabCommunity: "chatbubbles-outline",
  LabDms: "chatbubble-ellipses-outline",
  LabFriends: "people-outline",
  LabNotifications: "notifications-outline",
  LabSettings: "cog-outline",
  LabProfile: "person-circle-outline",
  LabThemeSpecimen: "color-palette-outline",
};

export function UxLabMaterialTopTabs() {
  const colors = useUxLabThemeColors();
  const indicatorStyle = useResolveClassNames("bg-primary");
  const safeAreaStyle = useResolveClassNames("bg-background");
  const sceneStyle = useResolveClassNames("bg-background");
  const tabBarStyle = useResolveClassNames(
    "border-b border-border bg-background",
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[{ flex: 1 }, safeAreaStyle]}
    >
      <Box className="flex-1 bg-background">
        <TopTabs.Navigator
          screenOptions={({ route }) => ({
            lazy: true,
            sceneStyle,
            tabBarActiveTintColor: colors.primaryForeground,
            tabBarInactiveTintColor: colors.mutedForeground,
            tabBarIndicatorStyle: indicatorStyle,
            tabBarItemStyle: { width: 112 },
            tabBarScrollEnabled: true,
            tabBarStyle,
            tabBarIcon: ({ color }) => (
              <Ionicons name={icons[route.name]} size={18} color={color} />
            ),
            tabBarShowIcon: true,
          })}
        >
          <TopTabs.Screen
            name="LabHome"
            component={UxLabHomeScreen}
            options={{ title: "Home" }}
          />
          <TopTabs.Screen
            name="LabCommunity"
            component={UxLabChannelScreen}
            options={{ title: "Channels" }}
          />
          <TopTabs.Screen
            name="LabDms"
            component={UxLabDirectMessagesScreen}
            options={{ title: "DMs" }}
          />
          <TopTabs.Screen
            name="LabFriends"
            component={UxLabFriendsScreen}
            options={{ title: "Friends" }}
          />
          <TopTabs.Screen
            name="LabNotifications"
            component={UxLabNotificationsScreen}
            options={{ title: "Inbox" }}
          />
          <TopTabs.Screen
            name="LabSettings"
            component={UxLabSettingsScreen}
            options={{ title: "Settings" }}
          />
          <TopTabs.Screen
            name="LabProfile"
            component={UxLabProfileScreen}
            options={{ title: "Profile" }}
          />
          <TopTabs.Screen
            name="LabThemeSpecimen"
            component={UxLabThemeSpecimenScreen}
            options={{ title: "Theme" }}
          />
        </TopTabs.Navigator>
      </Box>
    </SafeAreaView>
  );
}
