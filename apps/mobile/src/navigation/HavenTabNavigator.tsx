import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
} from "@react-navigation/native";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { BottomTabNavigatorProps } from "@react-navigation/bottom-tabs";
import { HavenModalShell } from "@/components/HavenModalShell";
import { HavenNavbar } from "@/components/HavenNavbar";
import UserSettingsContainer from "@/features/user-profile/UserSettingsContainer";

function HavenTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
}: BottomTabNavigatorProps) {
  const {
    state,
    descriptors,
    NavigationContent,
  } = useNavigationBuilder(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    UNSTABLE_routeNamesChangeBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const handleOpenNotifications = useCallback(() => {
    setIsNotificationsModalOpen(true);
  }, []);
  const handleCloseNotifications = useCallback(() => {
    setIsNotificationsModalOpen(false);
  }, []);

  const [isDirectMessagesModalOpen, setIsDirectMessagesModalOpen] = useState(false);
  const handleOpenDirectMessages = useCallback(() => {
    setIsDirectMessagesModalOpen(true);
  }, []);
  const handleCloseDirectMessages = useCallback(() => {
    setIsDirectMessagesModalOpen(false);
  }, []);

  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const handleOpenFriends = useCallback(() => {
    setIsFriendsModalOpen(true);
  }, []);
  const handleCloseFriends = useCallback(() => {
    setIsFriendsModalOpen(false);
  }, []);

  return (
    <>
      <NavigationContent>
        <View className="flex-1 bg-surface-modal">
          <HavenNavbar
            onPressSettings={handleOpenSettings}
            onPressNotifications={handleOpenNotifications}
            onPressDirectMessages={handleOpenDirectMessages}
            onPressFriends={handleOpenFriends}
          />
          <View style={styles.screensContainer}>
            {state.routes.map((route) => {
              const descriptor = descriptors[route.key];
              const isFocused = state.routes[state.index].key === route.key;
              return (
                <View
                  key={route.key}
                  style={[
                    StyleSheet.absoluteFillObject,
                    { opacity: isFocused ? 1 : 0 },
                  ]}
                  pointerEvents={isFocused ? "auto" : "none"}
                >
                  {descriptor.render()}
                </View>
              );
            })}
          </View>
        </View>
      </NavigationContent>
      <HavenModalShell
        variant="settings"
        visible={isSettingsModalOpen}
        onDismiss={handleCloseSettings}
        title="Settings"
      >
        <UserSettingsContainer
          onOpenVoiceSettings={() => {
            // TODO: open voice settings modal
          }}
          onSignOut={() => {
            // TODO: sign out
          }}
          onDeleteAccount={() => {
            // TODO: delete account
          }}
        />
      </HavenModalShell>
      <HavenModalShell
        variant="inbox"
        visible={isNotificationsModalOpen}
        onDismiss={handleCloseNotifications}
        title="Notifications"
      >
        <View className="mt-4 gap-3">
          <Text className="text-sm text-muted-foreground">
            Notification center will live here.
          </Text>
        </View>
      </HavenModalShell>
      <HavenModalShell
        variant="inbox"
        visible={isDirectMessagesModalOpen}
        onDismiss={handleCloseDirectMessages}
        title="Direct messages"
      >
        <View className="mt-4 gap-3">
          <Text className="text-sm text-muted-foreground">
            Direct messages and conversations will live here.
          </Text>
        </View>
      </HavenModalShell>
      <HavenModalShell
        variant="inbox"
        visible={isFriendsModalOpen}
        onDismiss={handleCloseFriends}
        title="Friends"
      >
        <View className="mt-4 gap-3">
          <Text className="text-sm text-muted-foreground">
            Your friends list will live here.
          </Text>
        </View>
      </HavenModalShell>
    </>
  );
}

const styles = StyleSheet.create({
  screensContainer: {
    flex: 1,
  },
});

export const createHavenTabNavigator = createNavigatorFactory(HavenTabNavigator);
