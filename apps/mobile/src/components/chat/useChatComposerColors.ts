import { useMemo } from "react";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

export type ChatComposerColors = {
  iconMuted: string;
  iconOnPrimary: string;
  placeholder: string;
  cursor: string;
  link: string;
  spoiler: string;
  text: string;
  /** List spinners / loading chrome tied to foreground. */
  spinner: string;
};

export function useChatComposerColors(): ChatComposerColors {
  const themeTokens = useMobileThemeTokens();

  return useMemo(
    () => ({
      iconMuted: resolveColorProp(themeTokens, "text-dim") ?? "#8b9cbb",
      iconOnPrimary: resolveColorProp(themeTokens, "primary-foreground") ?? "#ffffff",
      placeholder: resolveColorProp(themeTokens, "text-dim") ?? "#8e8e93",
      cursor: resolveColorProp(themeTokens, "foreground") ?? "#e6edf7",
      link: resolveColorProp(themeTokens, "primary") ?? "#3F79D8",
      spoiler: resolveColorProp(themeTokens, "text-muted") ?? "#a9b8cf",
      text: resolveColorProp(themeTokens, "foreground") ?? "#e6edf7",
      spinner: resolveColorProp(themeTokens, "foreground") ?? "#e6edf7",
    }),
    [themeTokens],
  );
}
