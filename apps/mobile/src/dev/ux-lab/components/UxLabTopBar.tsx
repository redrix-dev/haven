import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import type { UxLabSurface } from "../UxLabTypes";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { UxLabIcon } from "./UxLabIcon";

type UxLabTopBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
};

export function UxLabTopBar({ title, subtitle, onBack }: UxLabTopBarProps) {
  const { goToSurface } = useUxLabNavigationActions();

  const openSurface = (surface: UxLabSurface) => {
    goToSurface(surface);
  };

  return (
    <HStack className="items-center justify-between border-b border-border bg-surface-modal px-3 pb-3 pt-2">
      <HStack space="sm" className="items-center">
        <Pressable
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel"
          onPress={onBack ?? (() => openSurface("home"))}
        >
          <UxLabIcon
            name={onBack ? "chevron-back" : "home"}
            size={22}
            colorClassName="accent-foreground"
          />
        </Pressable>
        <VStack space="xs" className="max-w-[190px]">
          <Text size="lg" bold className="text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" className="text-muted-foreground" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </VStack>
      </HStack>
      <HStack space="sm">
        <Pressable
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel"
          onPress={() => openSurface("notifications")}
        >
          <UxLabIcon
            name="notifications-outline"
            size={21}
            colorClassName="accent-foreground"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel"
          onPress={() => openSurface("settings")}
        >
          <UxLabIcon
            name="cog-outline"
            size={21}
            colorClassName="accent-foreground"
          />
        </Pressable>
      </HStack>
    </HStack>
  );
}
