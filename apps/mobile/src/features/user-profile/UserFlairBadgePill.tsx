import { Text, View } from "react-native";
import type { UserFlairBadge } from "@shared/lib/backend/types";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

type UserFlairBadgePillProps = {
  flair: UserFlairBadge;
  align?: "start" | "center";
};

export function UserFlairBadgePill({
  flair,
  align = "start",
}: UserFlairBadgePillProps) {
  const themeTokens = useMobileThemeTokens();
  const color =
    resolveColorProp(themeTokens, flair.colorToken) ??
    resolveColorProp(themeTokens, "foreground") ??
    "#111827";
  const backgroundColor =
    resolveColorProp(themeTokens, flair.backgroundToken) ??
    resolveColorProp(themeTokens, "muted") ??
    "#F3F4F6";

  return (
    <View
      className={`${align === "center" ? "self-center" : "self-start"} rounded-full border px-2.5 py-1`}
      style={{ backgroundColor, borderColor: color }}
    >
      <Text className="text-xs font-semibold" style={{ color }}>
        {flair.label}
      </Text>
    </View>
  );
}
