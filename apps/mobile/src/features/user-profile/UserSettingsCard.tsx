// apps/mobile/src/features/user-profile/UserSettingsCard.tsx
import { ThemedIonicons } from "@/theme-rn";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

type SettingsRow = {
  id: string;
  label: string;
  subtitle?: string;
  icon?: ComponentProps<typeof ThemedIonicons>["name"];
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void | Promise<void>;
};

type UserSettingsCardProps = {
  rows: SettingsRow[];
};

export default function UserSettingsCard({ rows }: UserSettingsCardProps) {
  return (
    <View className="rounded-2xl bg-[#1C1C1E] overflow-hidden">
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        const labelColor = row.danger ? "#FF453A" : "#FFFFFF";
        const subtitleColor = row.danger ? "#FF9F99" : "#8E8E93";
        const iconColor = row.danger ? "#FF453A" : "#8E8E93";
        const chevronColor = row.danger ? "#FF9F99" : "#8E8E93";

        return (
          <Pressable
            key={row.id}
            onPress={() => void row.onPress?.()}
            disabled={row.disabled}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            className={`flex-row items-center gap-2.5 px-4 py-3 ${
              row.disabled ? "opacity-50" : "opacity-100"
            } ${isLast ? "" : "border-b border-[#2C2C2E]"}`}
          >
            {row.icon ? (
              <ThemedIonicons
                name={row.icon}
                size={18}
                colorClassName={row.danger ? "accent-destructive" : "accent-muted-foreground"}
              />
            ) : (
              <View className="w-4.5" />
            )}

            <View className="flex-1">
              <Text style={{ color: labelColor }} className="text-base font-medium">
                {row.label}
              </Text>
              {row.subtitle ? (
                <Text style={{ color: subtitleColor }} className="text-xs mt-0.5">
                  {row.subtitle}
                </Text>
              ) : null}
            </View>

            <ThemedIonicons
              name="chevron-forward"
              size={16}
              colorClassName={row.danger ? "accent-destructive" : "accent-muted-foreground"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}