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
 * Styles for React Navigation drawer + native-stack chrome (options only accept
 * `StyleProp` / color strings — no `className`).
 *
 * Token choice:
 * - **Primitives** (`surface-*`, `text-text-*`, `border-border-default`, …) when
 *   they are the resolved target of the old semantic names (see
 *   `packages/shared/src/themes/semantics.ts` → `semanticToPrimitive`).
 * - **Roles** (`primary`, `primary/alpha`) where there is no “deeper” surface
 *   primitive — accent / selection is intentionally theme-driven.
 *
 * Sections below follow visual ownership: drawer rail → scenes → stack header →
 * raw color props for APIs that require strings.
 */
export function useNavigationChromeStyles(): NavigationChromeStyles {
  // ─────────────────────────────────────────────────────────────────────────────
  // Drawer rail (the sliding panel: edge border + panel fill)
  // Maps: old `bg-background` + `border-border` → surface-1 + border-default primitive
  // ─────────────────────────────────────────────────────────────────────────────
  const drawerStyle = useResolveClassNames("border-r border-border-default bg-surface-3b");

  // ─────────────────────────────────────────────────────────────────────────────
  // Scene / stack area behind screens (drawer `sceneContainerStyle`, stack `contentStyle`)
  // Maps: old `bg-background` → primitive surface-1 (same as semantic `background`)
  // ─────────────────────────────────────────────────────────────────────────────
  const sceneContainerStyle = useResolveClassNames("bg-surface-0");

  // ─────────────────────────────────────────────────────────────────────────────
  // Native stack header bar (title area background)
  // Maps: old `bg-background` → surface-1
  // ─────────────────────────────────────────────────────────────────────────────
  const headerStyle = useResolveClassNames("bg-surface-0 border-b border-border-default");

  // ─────────────────────────────────────────────────────────────────────────────
  // Native stack header title text
  // Maps: old `text-foreground` → primitive `text-primary` → class `text-text-primary`
  // ─────────────────────────────────────────────────────────────────────────────
  const headerTitleStyle = useResolveClassNames("text-text-primary");

  // ─────────────────────────────────────────────────────────────────────────────
  // Drawer row: selected state fill (role — emphasis, not a flat surface step)
  // Stays `primary` + opacity so themes control the accent; string color is derived below.
  // ─────────────────────────────────────────────────────────────────────────────
  const drawerActiveBgResolved = useResolveClassNames("bg-primary/35");

  // String colors: navigation options have no *ClassName props — read CSS vars directly.
  // Primitives where they matched old semantics: `foreground` → `--text-primary`,
  // `muted-foreground` → `--text-muted`. `primary-foreground` is already a primitive slot name.
  const textPrimary = useCSSVariable("--text-primary");
  const primaryForeground = useCSSVariable("--primary-foreground");
  const textMuted = useCSSVariable("--text-muted");
  const primary = useCSSVariable("--primary");

  return useMemo(() => {
    const headerTintColor = typeof textPrimary === "string" ? textPrimary : "#e6edf7";
    const drawerActiveBackgroundColor =
      pickBackgroundColor(drawerActiveBgResolved as ViewStyle) ??
      (typeof primary === "string" ? `${String(primary)}59` : "rgba(63, 121, 216, 0.35)");
    const drawerActiveTintColor =
      typeof primaryForeground === "string" ? primaryForeground : "#f4f8ff";
    const drawerInactiveTintColor = typeof textMuted === "string" ? textMuted : "#a9b8cf";

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
    headerStyle,
    headerTitleStyle,
    primary,
    primaryForeground,
    sceneContainerStyle,
    textMuted,
    textPrimary,
  ]);
}
