import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMobileCommunityPermissionsHydration } from "@/hooks/useMobileCommunityPermissionsHydration";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { MobileNotificationsProvider } from "@/contexts/MobileNotificationsContext";
import { MobileSocialWorkspaceProvider } from "@/contexts/MobileSocialWorkspaceContext";
import { MobileDirectMessagesProvider } from "@/contexts/MobileDirectMessagesContext";
import { MobileMainSessionProvider } from "@/contexts/MobileMainSessionContext";
import { HomeScreen } from "@/screens/main/HomeScreen";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type { MainStackParamList } from "@/navigation/types";
import { NAV_THEME } from "@/lib/theme";

const Stack = createNativeStackNavigator<MainStackParamList>();

const mainStackScreenBackground = NAV_THEME.dark.colors.background;

export function MainNavigator() {
  const session = useAuthSession();
  const userId = session?.user?.id;
  useMobileCommunityPermissionsHydration(userId);
  useHydrateMobileThemeFromProfile(userId);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  return (
    <MobileNotificationsProvider userId={userId}>
      <MobileSocialWorkspaceProvider userId={userId}>
        <MobileDirectMessagesProvider userId={userId}>
          <MobileMainSessionProvider userId={userId}>
            <Stack.Navigator
              detachInactiveScreens={false}
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: mainStackScreenBackground },
              }}
            >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="Community"
              component={CommunityShell}
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
              }}
            />
            </Stack.Navigator>
          </MobileMainSessionProvider>
        </MobileDirectMessagesProvider>
      </MobileSocialWorkspaceProvider>
    </MobileNotificationsProvider>
  );
}
