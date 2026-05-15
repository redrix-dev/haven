import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Rev2ChannelThreadScreen } from "@/haven-rev2/screens/Rev2ChannelThreadScreen";
import { Rev2CommunityHostScreen } from "@/haven-rev2/screens/Rev2CommunityHostScreen";
import { Rev2CommunityListScreen } from "@/haven-rev2/screens/Rev2CommunityListScreen";
import type { Rev2CommunityStackParamList } from "@/haven-rev2/navigation/types";
import { useNavigationChromeStyles } from "@/theme-rn";

const Stack = createNativeStackNavigator<Rev2CommunityStackParamList>();

export function Rev2CommunityStack() {
  const chrome = useNavigationChromeStyles();
  return (
    <Stack.Navigator
      initialRouteName="Rev2CommunityList"
      screenOptions={{
        headerShown: true,
        headerTintColor: chrome.headerTintColor,
        headerStyle: chrome.headerStyle,
        headerTitleStyle: chrome.headerTitleStyle,
        contentStyle: chrome.sceneContainerStyle,
      }}
    >
      <Stack.Screen
        name="Rev2CommunityList"
        component={Rev2CommunityListScreen}
        options={{ title: "Communities" }}
      />
      <Stack.Screen
        name="Rev2CommunityHost"
        component={Rev2CommunityHostScreen}
        options={{ title: "Channels" }}
      />
      <Stack.Screen
        name="Rev2ChannelThread"
        component={Rev2ChannelThreadScreen}
        options={{ title: "Channel" }}
      />
    </Stack.Navigator>
  );
}
