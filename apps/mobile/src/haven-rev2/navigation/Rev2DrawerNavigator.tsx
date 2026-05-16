import type { ComponentProps } from "react";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { Box } from "@/components/ui/box";
import { Rev2CommunityStack } from "@/haven-rev2/navigation/Rev2CommunityStack";
import { Rev2FriendsStack } from "@/haven-rev2/navigation/Rev2FriendsStack";
import { Rev2NotificationsStack } from "@/haven-rev2/navigation/Rev2NotificationsStack";
import { Rev2SettingsStack } from "@/haven-rev2/navigation/Rev2SettingsStack";
import type { Rev2DrawerParamList } from "@/haven-rev2/navigation/types";
import { Rev2PushNavigationHost } from "@/haven-rev2/Rev2PushNavigationHost";
import { ThemedIonicons, useNavigationChromeStyles } from "@/theme-rn";

const Drawer = createDrawerNavigator<Rev2DrawerParamList>();

function Rev2DrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView {...props}>
      <Rev2PushNavigationHost />
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

const icons: Record<keyof Rev2DrawerParamList, ComponentProps<typeof ThemedIonicons>["name"]> = {
  Rev2Home: "home-outline",
  Rev2Friends: "people-outline",
  Rev2Notifications: "notifications-outline",
  Rev2Settings: "cog-outline",
};

export function Rev2DrawerNavigator() {
  const chrome = useNavigationChromeStyles();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[{ flex: 1 }, chrome.sceneContainerStyle]}>
      <Box className="min-h-0 flex-1 bg-background">
        <Drawer.Navigator
          drawerContent={(props) => <Rev2DrawerContent {...props} />}
          screenOptions={({ route }) => ({
            headerShown: false,
            drawerActiveBackgroundColor: chrome.drawerActiveBackgroundColor,
            drawerActiveTintColor: chrome.drawerActiveTintColor,
            drawerInactiveTintColor: chrome.drawerInactiveTintColor,
            drawerStyle: chrome.drawerStyle,
            drawerItemStyle: { borderRadius: 14 },
            sceneContainerStyle: chrome.sceneContainerStyle,
            drawerIcon: ({ focused, size }) => (
              <ThemedIonicons
                name={icons[route.name]}
                size={size}
                colorClassName={focused ? "accent-primary-foreground" : "accent-text-muted"}
              />
            ),
          })}
        >
          <Drawer.Screen
            name="Rev2Home"
            component={Rev2CommunityStack}
            options={{ title: "Home" }}
            listeners={({ navigation }) => ({
              drawerItemPress: () => {
                useNavigationStore.getState().setCurrentServerId(null);
                useNavigationStore.getState().setCurrentChannelId(null);
                navigation.navigate("Rev2Home", {
                  screen: "Rev2CommunityList",
                });
              },
            })}
          />
          <Drawer.Screen name="Rev2Friends" component={Rev2FriendsStack} options={{ title: "Friends" }} />
          <Drawer.Screen
            name="Rev2Notifications"
            component={Rev2NotificationsStack}
            options={{ title: "Notifications" }}
          />
          <Drawer.Screen
            name="Rev2Settings"
            component={Rev2SettingsStack}
            options={{ title: "Settings" }}
          />
        </Drawer.Navigator>
      </Box>
    </SafeAreaView>
  );
}
