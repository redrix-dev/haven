import { useMemo } from "react";
import type { ViewStyle } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";

function pickBackgroundColor(resolved: ViewStyle): string | undefined {
  const bg = resolved.backgroundColor;
  return typeof bg === "string" ? bg : undefined;
}

export type DmBubbleSheetChrome = {
  sheetTitleColor: string;
  sheetPlaceholderColor: string;
  channelPillBackground: string;
  channelPillSelectedBackground: string;
  channelPillBorderColor: string;
  channelPillLabelColor: string;
  unreadBadgeBackground: string;
  unreadBadgeTextColor: string;
  bubbleActiveBorderColor: string;
};

/**
 * Sheet / pill chrome for `DMFloatingBubble` from UniWind CSS variables.
 */
export function useDmBubbleSheetChrome(): DmBubbleSheetChrome {
  const primaryForeground = useCSSVariable("--primary-foreground");
  const mutedForeground = useCSSVariable("--muted-foreground");
  const border = useCSSVariable("--border");
  const ring = useCSSVariable("--ring");
  const pillBgResolved = useResolveClassNames("bg-muted/30");
  const pillSelectedResolved = useResolveClassNames("bg-muted/50");
  const destructive = useCSSVariable("--destructive");
  const destructiveForeground = useCSSVariable("--destructive-foreground");

  return useMemo(() => {
    const sheetTitleColor =
      typeof primaryForeground === "string" ? primaryForeground : "#f8fafc";
    const sheetPlaceholderColor =
      typeof mutedForeground === "string" ? `${mutedForeground}b8` : "rgba(248,250,252,0.72)";
    const channelPillBackground =
      pickBackgroundColor(pillBgResolved as ViewStyle) ?? "rgba(255,255,255,0.12)";
    const channelPillSelectedBackground =
      pickBackgroundColor(pillSelectedResolved as ViewStyle) ?? "rgba(255,255,255,0.28)";
    const channelPillBorderColor = typeof border === "string" ? border : "rgba(255,255,255,0.45)";
    const channelPillLabelColor = sheetTitleColor;
    const unreadBadgeBackground =
      typeof destructive === "string" ? destructive : "#ef4444";
    const unreadBadgeTextColor =
      typeof destructiveForeground === "string" ? destructiveForeground : "#ffffff";
    const bubbleActiveBorderColor = typeof ring === "string" ? ring : "rgba(255,255,255,0.9)";

    return {
      sheetTitleColor,
      sheetPlaceholderColor,
      channelPillBackground,
      channelPillSelectedBackground,
      channelPillBorderColor,
      channelPillLabelColor,
      unreadBadgeBackground,
      unreadBadgeTextColor,
      bubbleActiveBorderColor,
    };
  }, [
    border,
    destructive,
    destructiveForeground,
    mutedForeground,
    pillBgResolved,
    pillSelectedResolved,
    primaryForeground,
    ring,
  ]);
}
