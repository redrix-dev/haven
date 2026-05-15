import { useMemo } from "react";
import type { ViewStyle } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";

function pickBackgroundColor(resolved: ViewStyle): string | undefined {
  const bg = resolved.backgroundColor;
  return typeof bg === "string" ? bg : undefined;
}

export type ComposerRnemCssVariables = {
  foreground: string;
  textDim: string;
  textMuted: string;
  primary: string;
  primaryForeground: string;
  ring: string;
  selection: string;
  spoilerBackground: string;
};

/**
 * Maps `global.css` CSS variables into strings for `react-native-enriched-markdown`
 * style objects (props that are not UniWind `className`).
 */
export function useComposerRnemCssVariables(): ComposerRnemCssVariables {
  const foreground = useCSSVariable("--foreground");
  const textDim = useCSSVariable("--text-dim");
  const textMuted = useCSSVariable("--text-muted");
  const primary = useCSSVariable("--primary");
  const primaryForeground = useCSSVariable("--primary-foreground");
  const ring = useCSSVariable("--ring");
  const spoilerResolved = useResolveClassNames("bg-muted/20");

  return useMemo(() => {
    const spoilerBackground =
      pickBackgroundColor(spoilerResolved as ViewStyle) ?? "rgba(0,0,0,0.2)";
    const ringStr = typeof ring === "string" ? ring : "rgba(63, 121, 216, 0.4)";

    return {
      foreground: typeof foreground === "string" ? foreground : "#e6edf7",
      textDim: typeof textDim === "string" ? textDim : "#8898b1",
      textMuted: typeof textMuted === "string" ? textMuted : "#a9b8cf",
      primary: typeof primary === "string" ? primary : "#3F79D8",
      primaryForeground:
        typeof primaryForeground === "string" ? primaryForeground : "#ffffff",
      ring: ringStr,
      selection: ringStr,
      spoilerBackground,
    };
  }, [foreground, primary, primaryForeground, ring, spoilerResolved, textDim, textMuted]);
}
