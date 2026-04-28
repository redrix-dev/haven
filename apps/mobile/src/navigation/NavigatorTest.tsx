import {
  createNavigatorFactory,
  type ParamListBase,
  type TabActionHelpers,
  TabActions,
  type TabNavigationState,
  TabRouter,
  type TabRouterOptions,
  useNavigationBuilder,
} from "@react-navigation/native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type {
  BottomTabNavigationEventMap,
  BottomTabNavigationOptions,
  BottomTabNavigatorProps,
} from "@react-navigation/bottom-tabs";
import { HavenNavbar } from "../components/HavenNavbar";

type NavigatorTestProps = {
  includeHavenNavbar?: boolean;
  includeTopTabs?: boolean;
};

function NavigatorTest({
  includeHavenNavbar = true,
  includeTopTabs = true,
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
}: BottomTabNavigatorProps & NavigatorTestProps) {
  const {
    state,
    descriptors,
    navigation,
    NavigationContent,
  } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    BottomTabNavigationOptions,
    BottomTabNavigationEventMap
  >(TabRouter, {
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

  const focusedRoute = state.routes[state.index];
  const focusedDescriptor = descriptors[focusedRoute.key];
  const hideNavigatorNavbar = Boolean(
    (focusedDescriptor.options as { hideNavigatorNavbar?: boolean })?.hideNavigatorNavbar,
  );
  const hideNavigatorTabs = Boolean(
    (focusedDescriptor.options as { hideNavigatorTabs?: boolean })?.hideNavigatorTabs,
  );

  return (
    <NavigationContent>
      <View className="flex-1 bg-surface-modal">
        {includeHavenNavbar && !hideNavigatorNavbar ? <HavenNavbar /> : null}

        {includeTopTabs && !hideNavigatorTabs ? (
          <View className="border-b border-border-panel bg-surface-modal px-2 pb-2">
            <View className="flex-row gap-2">
              {state.routes.map((route, index) => {
                const isFocused = state.index === index;
                const descriptor = descriptors[route.key];
                const options = descriptor.options as {
                  title?: string;
                  tabBarLabel?: string | ((props: unknown) => ReactNode);
                };
                const rawLabel = options.tabBarLabel;
                const label =
                  typeof rawLabel === "string"
                    ? rawLabel
                    : (options.title ?? route.name);

                const onPress = () => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.dispatch({
                      ...TabActions.jumpTo(route.name, route.params),
                      target: state.key,
                    });
                  }
                };

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    className={
                      isFocused
                        ? "rounded-xl bg-surface-panel px-3 py-2"
                        : "rounded-xl bg-transparent px-3 py-2 active:bg-surface-panel"
                    }
                    onPress={onPress}
                  >
                    <Text className={isFocused ? "text-foreground" : "text-muted-foreground"}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="flex-1">{focusedDescriptor.render()}</View>
      </View>
    </NavigationContent>
  );
}

export const createNavigatorTest = createNavigatorFactory(NavigatorTest);