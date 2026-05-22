import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { MobileNotificationsProvider } from "@/contexts/MobileNotificationsContext";
import { MobileSocialWorkspaceProvider } from "@/contexts/MobileSocialWorkspaceContext";
import { MobileDirectMessagesProvider } from "@/contexts/MobileDirectMessagesContext";
import { MobileMainSessionProvider } from "@/contexts/MobileMainSessionContext";
import { HomeScreen } from "@/screens/main/HomeScreen";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type { MainStackParamList } from "@/navigation/types";
import { NAV_THEME } from "@/lib/theme";
import { setMobileNavigationDelegate } from "@/lib/registerMobileAppHost";
import { requireHavenCore } from "@shared/core";
import { MOBILE_DEFAULT_NOTIFICATION_AUDIO } from "@/constants/mobileNotificationAudioDefaults";

const Stack = createNativeStackNavigator<MainStackParamList>();

const mainStackScreenBackground = NAV_THEME.dark.colors.background;

/**
 * Bridges React Navigation imperative API into the shared AppHost so external
 * events (notification taps, deep links, access-revoked redirects) can move
 * the user without a navigation ref reaching into shared code.
 */
function MainNavigationDelegateBridge() {
  const navigation =
    useNavigation<NavigationProp<MainStackParamList>>();

  useEffect(() => {
    setMobileNavigationDelegate({
      navigateToCommunity: (serverId, channelId) => {
        try {
          requireHavenCore().communities.setActiveId(serverId);
          if (channelId) {
            requireHavenCore().channels.setActiveChannelId(channelId);
          }
        } catch {
          // HavenCore may not be ready during cold-start race; navigation alone is fine.
        }
        navigation.navigate("Community", { serverId });
      },
      navigateToDm: (_conversationId) => {
        // DM workspace is Phase 4 — for now route to Home where DMs live.
        navigation.navigate("Home");
      },
    });
    return () => setMobileNavigationDelegate(null);
  }, [navigation]);

  return null;
}

export function MainNavigator() {
  const session = useAuthSession();
  const userId = session?.user?.id;
  useHydrateMobileThemeFromProfile(userId);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  return (
    <MobileNotificationsProvider userId={userId} audioSettings={MOBILE_DEFAULT_NOTIFICATION_AUDIO}>
      <MobileSocialWorkspaceProvider userId={userId}>
        <MobileDirectMessagesProvider userId={userId}>
          <MobileMainSessionProvider userId={userId}>
            <MainNavigationDelegateBridge />
            <Stack.Navigator
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
