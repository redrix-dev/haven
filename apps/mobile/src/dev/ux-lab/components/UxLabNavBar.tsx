import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { HStack } from "@/components/ui/hstack";
import type { UxLabSurface } from "../UxLabTypes";
import { useUxLabNavigationActions } from "../UxLabNavigationActions";
import { useUxLabStore } from "../UxLabStore";
import { UxLabIcon } from "./UxLabIcon";

const navItems: Array<{
  surface: UxLabSurface;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { surface: "home", label: "Home", icon: "grid-outline" },
  { surface: "community", label: "Channels", icon: "chatbubbles-outline" },
  { surface: "dms", label: "DMs", icon: "chatbubble-ellipses-outline" },
  { surface: "friends", label: "Friends", icon: "people-outline" },
  { surface: "themeSpecimen", label: "Theme", icon: "color-palette-outline" },
];

export function UxLabNavBar() {
  const activeSurface = useUxLabStore((s) => s.activeSurface);
  const { goToSurface } = useUxLabNavigationActions();

  return (
    <HStack className="border-t border-border bg-surface-modal px-2 pb-3 pt-2">
      {navItems.map((item) => {
        const selected = activeSurface === item.surface;
        return (
          <Pressable
            key={item.surface}
            accessibilityRole="button"
            className={`min-w-0 flex-1 items-center rounded-xl px-1 py-2 ${
              selected ? "bg-primary" : "bg-transparent"
            }`}
            onPress={() => goToSurface(item.surface)}
          >
            <UxLabIcon
              name={item.icon}
              size={20}
              colorClassName={
                selected
                  ? "accent-primary-foreground"
                  : "accent-muted-foreground"
              }
            />
            <Text
              size="xs"
              className={
                selected ? "text-primary-foreground" : "text-muted-foreground"
              }
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </HStack>
  );
}
