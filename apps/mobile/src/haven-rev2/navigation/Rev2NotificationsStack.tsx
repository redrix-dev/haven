import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Rev2NotificationsPlaceholderScreen } from "@/haven-rev2/screens/Rev2NotificationsPlaceholderScreen";
import type { Rev2NotificationsStackParamList } from "@/haven-rev2/navigation/types";
import { useNavigationChromeStyles } from "@/theme-rn";

const Stack = createNativeStackNavigator<Rev2NotificationsStackParamList>();

export function Rev2NotificationsStack() {
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
      <Stack.Screen
        name="Rev2NotificationsHome"
        component={Rev2NotificationsPlaceholderScreen}
        options={{ title: "Notifications" }}
      />
    </Stack.Navigator>
  );
}
