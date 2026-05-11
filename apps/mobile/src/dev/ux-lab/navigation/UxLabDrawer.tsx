import { Ionicons } from "@expo/vector-icons";
import { createDrawerNavigator } from "@react-navigation/drawer";
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

export type UxLabDrawerParamList = {
  UxLabHome: undefined;
  UxLabCommunity: undefined;
  UxLabDms: undefined;
  UxLabFriends: undefined;
  UxLabNotifications: undefined;
  UxLabSettings: undefined;
  UxLabProfile: undefined;
  UxLabThemeSpecimen: undefined;
};

const Drawer = createDrawerNavigator<UxLabDrawerParamList>();

const icons: Record<
  keyof UxLabDrawerParamList,
  keyof typeof Ionicons.glyphMap
> = {
  UxLabHome: "grid-outline",
  UxLabCommunity: "chatbubbles-outline",
  UxLabDms: "chatbubble-ellipses-outline",
  UxLabFriends: "people-outline",
  UxLabNotifications: "notifications-outline",
  UxLabSettings: "cog-outline",
  UxLabProfile: "person-circle-outline",
  UxLabThemeSpecimen: "color-palette-outline",
};

export function UxLabDrawer() {
  const colors = useUxLabThemeColors();
  const drawerStyle = useResolveClassNames(
    "border-r border-border bg-background",
  );
  const safeAreaStyle = useResolveClassNames("bg-background");
  const sceneStyle = useResolveClassNames("bg-background");

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[{ flex: 1 }, safeAreaStyle]}
    >
      <Box className="flex-1 bg-background">
        <Drawer.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            drawerActiveBackgroundColor: colors.primary,
            drawerActiveTintColor: colors.primaryForeground,
            drawerInactiveTintColor: colors.mutedForeground,
            drawerStyle,
            drawerItemStyle: { borderRadius: 14 },
            drawerIcon: ({ color, size }) => (
              <Ionicons name={icons[route.name]} size={size} color={color} />
            ),
            sceneStyle,
          })}
        >
          <Drawer.Screen
            name="UxLabHome"
            component={UxLabHomeScreen}
            options={{ title: "Home" }}
          />
          <Drawer.Screen
            name="UxLabCommunity"
            component={UxLabChannelScreen}
            options={{ title: "Channels" }}
          />
          <Drawer.Screen
            name="UxLabDms"
            component={UxLabDirectMessagesScreen}
            options={{ title: "Direct Messages" }}
          />
          <Drawer.Screen
            name="UxLabFriends"
            component={UxLabFriendsScreen}
            options={{ title: "Friends" }}
          />
          <Drawer.Screen
            name="UxLabNotifications"
            component={UxLabNotificationsScreen}
            options={{ title: "Inbox" }}
          />
          <Drawer.Screen
            name="UxLabSettings"
            component={UxLabSettingsScreen}
            options={{ title: "Settings" }}
          />
          <Drawer.Screen
            name="UxLabProfile"
            component={UxLabProfileScreen}
            options={{ title: "Profile" }}
          />
          <Drawer.Screen
            name="UxLabThemeSpecimen"
            component={UxLabThemeSpecimenScreen}
            options={{ title: "Theme specimen" }}
          />
        </Drawer.Navigator>
      </Box>
    </SafeAreaView>
  );
}
