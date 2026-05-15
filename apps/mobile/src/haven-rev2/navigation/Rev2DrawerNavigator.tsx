import type { ComponentProps } from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { Box } from "@/components/ui/box";
import { Rev2CommunityStack } from "@/haven-rev2/navigation/Rev2CommunityStack";
import { Rev2NotificationsStack } from "@/haven-rev2/navigation/Rev2NotificationsStack";
import { Rev2SettingsStack } from "@/haven-rev2/navigation/Rev2SettingsStack";
import type { Rev2DrawerParamList } from "@/haven-rev2/navigation/types";
import { Rev2HomeScreen } from "@/haven-rev2/screens/Rev2HomeScreen";
import { Rev2ThemeSpecimenScreen } from "@/haven-rev2/screens/Rev2ThemeSpecimenScreen";
import { ThemedIonicons, useNavigationChromeStyles } from "@/theme-rn";

const Drawer = createDrawerNavigator<Rev2DrawerParamList>();

// REV2_INFERRED: Drawer v7 typings here omit `unmountOnBlur` (per-drawer-item) unlike some tab APIs;
// warm vs disposable surfaces can later use nested native-stack `detachInactiveScreens` or screen freezing.

const icons: Record<keyof Rev2DrawerParamList, ComponentProps<typeof ThemedIonicons>["name"]> = {
  Rev2Home: "home-outline",
  Rev2Community: "chatbubbles-outline",
  Rev2Notifications: "notifications-outline",
  Rev2Settings: "cog-outline",
  Rev2ThemeSpecimen: "color-palette-outline",
};

export function Rev2DrawerNavigator() {
  const chrome = useNavigationChromeStyles();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[{ flex: 1 }, chrome.sceneContainerStyle]}>
      <Box className="min-h-0 flex-1 bg-background">
        <Drawer.Navigator
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
                colorClassName={focused ? "accent-primary-foreground" : "accent-muted-foreground"}
              />
            ),
          })}
        >
          <Drawer.Screen name="Rev2Home" component={Rev2HomeScreen} options={{ title: "Home" }} />
          <Drawer.Screen
            name="Rev2Community"
            component={Rev2CommunityStack}
            options={{ title: "Community" }}
            listeners={({ navigation }) => ({
              drawerItemPress: () => {
                useNavigationStore.getState().setCurrentServerId(null);
                useNavigationStore.getState().setCurrentChannelId(null);
                navigation.navigate("Rev2Community", {
                  screen: "Rev2CommunityList",
                });
              },
            })}
          />
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
          <Drawer.Screen
            name="Rev2ThemeSpecimen"
            component={Rev2ThemeSpecimenScreen}
            options={{ title: "Theme" }}
          />
        </Drawer.Navigator>
      </Box>
    </SafeAreaView>
  );
}
