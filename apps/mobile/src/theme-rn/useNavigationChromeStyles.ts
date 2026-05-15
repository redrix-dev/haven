import { useMemo } from "react";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { StyleProp, ViewStyle } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";

type NativeStackHeaderStyle = NonNullable<NativeStackNavigationOptions["headerStyle"]>;
type NativeStackHeaderTitleStyle = NonNullable<NativeStackNavigationOptions["headerTitleStyle"]>;
type NativeStackContentStyle = NonNullable<NativeStackNavigationOptions["contentStyle"]>;

export type NavigationChromeStyles = {
  drawerStyle: StyleProp<ViewStyle>;
  sceneContainerStyle: NativeStackContentStyle;
  headerStyle: NativeStackHeaderStyle;
  headerTitleStyle: NativeStackHeaderTitleStyle;
  headerTintColor: string;
  drawerActiveBackgroundColor: string;
  drawerActiveTintColor: string;
  drawerInactiveTintColor: string;
};

function pickBackgroundColor(resolved: ViewStyle): string | undefined {
  const bg = resolved.backgroundColor;
  return typeof bg === "string" ? bg : undefined;
}

/**
 * React Navigation drawer + native-stack options backed by UniWind tokens
 * (`useResolveClassNames`, `useCSSVariable` on CSS vars from `global.css`).
 */
export function useNavigationChromeStyles(): NavigationChromeStyles {
  const drawerStyle = useResolveClassNames("border-r border-border bg-background");
  const sceneContainerStyle = useResolveClassNames("bg-background");
  const headerStyle = useResolveClassNames("bg-background");
  const headerTitleStyle = useResolveClassNames("text-foreground");

  const drawerActiveBgResolved = useResolveClassNames("bg-primary/35");

  const foreground = useCSSVariable("--foreground");
  const primaryForeground = useCSSVariable("--primary-foreground");
  const mutedForeground = useCSSVariable("--muted-foreground");
  const primary = useCSSVariable("--primary");

  return useMemo(() => {
    const headerTintColor = typeof foreground === "string" ? foreground : "#e6edf7";
    const drawerActiveBackgroundColor =
      pickBackgroundColor(drawerActiveBgResolved as ViewStyle) ??
      (typeof primary === "string" ? `${String(primary)}59` : "rgba(63, 121, 216, 0.35)");
    const drawerActiveTintColor =
      typeof primaryForeground === "string" ? primaryForeground : "#f8fafc";
    const drawerInactiveTintColor =
      typeof mutedForeground === "string" ? mutedForeground : "#94a3b8";

    return {
      drawerStyle,
      sceneContainerStyle: sceneContainerStyle as NativeStackContentStyle,
      headerStyle: headerStyle as NativeStackHeaderStyle,
      headerTitleStyle: headerTitleStyle as NativeStackHeaderTitleStyle,
      headerTintColor,
      drawerActiveBackgroundColor,
      drawerActiveTintColor,
      drawerInactiveTintColor,
    };
  }, [
    drawerActiveBgResolved,
    drawerStyle,
    foreground,
    headerStyle,
    headerTitleStyle,
    mutedForeground,
    primary,
    primaryForeground,
    sceneContainerStyle,
  ]);
}
