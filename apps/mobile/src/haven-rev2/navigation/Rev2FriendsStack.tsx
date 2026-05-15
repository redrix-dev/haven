import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Rev2FriendsScreen } from "@/haven-rev2/screens/Rev2FriendsScreen";
import type { Rev2FriendsStackParamList } from "@/haven-rev2/navigation/types";
import { useNavigationChromeStyles } from "@/theme-rn";

const Stack = createNativeStackNavigator<Rev2FriendsStackParamList>();

export function Rev2FriendsStack() {
  const chrome = useNavigationChromeStyles();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerTintColor: chrome.headerTintColor,
        headerStyle: chrome.headerStyle,
        headerTitleStyle: chrome.headerTitleStyle,
        contentStyle: chrome.sceneContainerStyle,
      }}
    >
      <Stack.Screen name="Rev2FriendsHome" component={Rev2FriendsScreen} options={{ title: "Friends" }} />
    </Stack.Navigator>
  );
}
