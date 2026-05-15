import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Rev2SettingsPlaceholderScreen } from "@/haven-rev2/screens/Rev2SettingsPlaceholderScreen";
import type { Rev2SettingsStackParamList } from "@/haven-rev2/navigation/types";
import { useNavigationChromeStyles } from "@/theme-rn";

const Stack = createNativeStackNavigator<Rev2SettingsStackParamList>();

export function Rev2SettingsStack() {
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
        name="Rev2SettingsHome"
        component={Rev2SettingsPlaceholderScreen}
        options={{ title: "Settings" }}
      />
    </Stack.Navigator>
  );
}
