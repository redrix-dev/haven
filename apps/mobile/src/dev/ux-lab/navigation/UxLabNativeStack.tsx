import { createNativeStackNavigator } from "@react-navigation/native-stack";
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

export type UxLabStackParamList = {
  UxLabHome: undefined;
  UxLabCommunity: undefined;
  UxLabDms: undefined;
  UxLabFriends: undefined;
  UxLabNotifications: undefined;
  UxLabSettings: undefined;
  UxLabProfile: undefined;
  UxLabThemeSpecimen: undefined;
};

const Stack = createNativeStackNavigator<UxLabStackParamList>();

export function UxLabNativeStack() {
  const contentStyle = useResolveClassNames("bg-background");
  const safeAreaStyle = useResolveClassNames("bg-background");

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[{ flex: 1 }, safeAreaStyle]}
    >
      <Box className="flex-1 bg-background">
        <Stack.Navigator
          screenOptions={{
            animation: "slide_from_right",
            contentStyle,
            headerShown: false,
          }}
        >
          <Stack.Screen name="UxLabHome" component={UxLabHomeScreen} />
          <Stack.Screen name="UxLabCommunity" component={UxLabChannelScreen} />
          <Stack.Screen name="UxLabDms" component={UxLabDirectMessagesScreen} />
          <Stack.Screen name="UxLabFriends" component={UxLabFriendsScreen} />
          <Stack.Screen
            name="UxLabNotifications"
            component={UxLabNotificationsScreen}
          />
          <Stack.Screen name="UxLabSettings" component={UxLabSettingsScreen} />
          <Stack.Screen name="UxLabProfile" component={UxLabProfileScreen} />
          <Stack.Screen
            name="UxLabThemeSpecimen"
            component={UxLabThemeSpecimenScreen}
          />
        </Stack.Navigator>
      </Box>
    </SafeAreaView>
  );
}
