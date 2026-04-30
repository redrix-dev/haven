import {
    createNavigatorFactory,
    TabRouter,
    useNavigationBuilder,
  } from "@react-navigation/native";
  import { StyleSheet, View } from "react-native";
  import type { BottomTabNavigatorProps } from "@react-navigation/bottom-tabs";
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
    return (
      <NavigationContent>
        <View className="flex-1 bg-surface-modal">
          <HavenNavbar />
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
    );
  }
  
  const styles = StyleSheet.create({
    screensContainer: {
      flex: 1,
    },
  });
  
  export const createNavigatorTest = createNavigatorFactory(NavigatorTest);