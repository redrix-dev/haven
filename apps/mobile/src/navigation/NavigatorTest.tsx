import {
    createNavigatorFactory,
    TabRouter,
    useNavigationBuilder,
  } from "@react-navigation/native";
  import { useCallback, useState } from "react";
  import { StyleSheet, Text, View } from "react-native";
  import type { BottomTabNavigatorProps } from "@react-navigation/bottom-tabs";
  import { HavenModalShell } from "../components/HavenModalShell";
  import { HavenNavbar } from "../components/HavenNavbar";
  function NavigatorTest({
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

    return (
      <>
        <NavigationContent>
          <View className="flex-1 bg-surface-modal">
            <HavenNavbar onPressSettings={handleOpenSettings} />
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
        <View className="mt-4 gap-3">
          <Text className="text-sm text-muted-foreground">
            Account and settings management will live here.
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
  
  export const createNavigatorTest = createNavigatorFactory(NavigatorTest);