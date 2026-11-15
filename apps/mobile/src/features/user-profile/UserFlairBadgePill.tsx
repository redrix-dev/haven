import { Text, View } from "react-native";
import type { ProfileFlair } from "@shared/lib/backend/records";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

type UserFlairBadgePillProps = {
  flair: Pick<ProfileFlair, "label" | "color_token" | "background_token">;
  align?: "start" | "center";
};

export function UserFlairBadgePill({
  flair,
  align = "start",
}: UserFlairBadgePillProps) {
  const themeTokens = useMobileThemeTokens();
  const color =
    resolveColorProp(themeTokens, flair.color_token) ??
    resolveColorProp(themeTokens, "foreground") ??
    "#111827";
  const backgroundColor =
    resolveColorProp(themeTokens, flair.background_token) ??
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
