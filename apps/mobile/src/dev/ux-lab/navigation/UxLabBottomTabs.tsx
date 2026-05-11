import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
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

export type UxLabBottomTabParamList = {
  LabHome: undefined;
  LabCommunity: undefined;
  LabDms: undefined;
  LabFriends: undefined;
  LabNotifications: undefined;
  LabSettings: undefined;
  LabProfile: undefined;
  LabThemeSpecimen: undefined;
};

const Tab = createBottomTabNavigator<UxLabBottomTabParamList>();

const icons: Record<
  keyof UxLabBottomTabParamList,
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

export function UxLabBottomTabs() {
  const colors = useUxLabThemeColors();
  const safeAreaStyle = useResolveClassNames("bg-background");
  const sceneStyle = useResolveClassNames("bg-background");
  const tabBarStyle = useResolveClassNames(
    "border-t border-border bg-background",
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[{ flex: 1 }, safeAreaStyle]}
    >
      <Box className="flex-1 bg-background">
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            sceneStyle,
            tabBarStyle,
            tabBarActiveTintColor: colors.primaryForeground,
            tabBarInactiveTintColor: colors.mutedForeground,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={icons[route.name]} size={size} color={color} />
            ),
          })}
        >
          <Tab.Screen
            name="LabHome"
            component={UxLabHomeScreen}
            options={{ title: "Home" }}
          />
          <Tab.Screen
            name="LabCommunity"
            component={UxLabChannelScreen}
            options={{ title: "Channels" }}
          />
          <Tab.Screen
            name="LabDms"
            component={UxLabDirectMessagesScreen}
            options={{ title: "DMs" }}
          />
          <Tab.Screen
            name="LabFriends"
            component={UxLabFriendsScreen}
            options={{ title: "Friends" }}
          />
          <Tab.Screen
            name="LabNotifications"
            component={UxLabNotificationsScreen}
            options={{ title: "Inbox" }}
          />
          <Tab.Screen
            name="LabSettings"
            component={UxLabSettingsScreen}
            options={{ title: "Settings" }}
          />
          <Tab.Screen
            name="LabProfile"
            component={UxLabProfileScreen}
            options={{ title: "Profile" }}
          />
          <Tab.Screen
            name="LabThemeSpecimen"
            component={UxLabThemeSpecimenScreen}
            options={{ title: "Theme" }}
          />
        </Tab.Navigator>
      </Box>
    </SafeAreaView>
  );
}
