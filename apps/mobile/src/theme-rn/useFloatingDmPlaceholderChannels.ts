import { useMemo } from "react";
import { useCSSVariable } from "uniwind";
import type {
  FloatingDmChannelConfig,
  FloatingDmChannelId,
} from "@/theme-rn/floatingDmTypes";

type ChannelSeed = {
  id: FloatingDmChannelId;
  label: string;
  sheetTitle: string;
  unreadCount: number;
};

const SEEDS: readonly ChannelSeed[] = [
  {
    id: "inbox",
    label: "Inbox",
    sheetTitle: "Direct messages",
    unreadCount: 2,
  },
  {
    id: "modmail",
    label: "Mod mail",
    sheetTitle: "Moderator inbox",
    unreadCount: 0,
  },
];

/** Modmail header entry on legacy `NotificationsContainer` (`Ionicons` amber-400). */
const MODMAIL_BUBBLE_GOLD = "#fbbf24";

/**
 * Default floating DM channel chrome derived from UniWind theme variables.
 */
export function useFloatingDmPlaceholderChannels(): FloatingDmChannelConfig[] {
  const primary = useCSSVariable("--primary");
  const surfacePanel = useCSSVariable("--surface-panel");
  const destructivePanel = useCSSVariable("--surface-destructive-panel");

  return useMemo(() => {
    const inboxBubble = typeof primary === "string" ? primary : "#3f79d8";
    const inboxSheet =
      typeof surfacePanel === "string" ? surfacePanel : "#142033";
    const modSheet =
      typeof destructivePanel === "string" ? destructivePanel : "#2a1821";

    return SEEDS.map((seed) => {
      const isInbox = seed.id === "inbox";
      return {
        id: seed.id,
        label: seed.label,
        sheetTitle: seed.sheetTitle,
        bubbleColor: isInbox ? inboxBubble : MODMAIL_BUBBLE_GOLD,
        sheetBackgroundColor: isInbox ? inboxSheet : modSheet,
        bubbleIconName: isInbox
          ? ("mail-outline" as const)
          : ("shield-outline" as const),
        bubbleIconColorClassName: isInbox
          ? ("accent-primary-foreground" as const)
          : ("accent-background" as const),
        unreadCount: seed.unreadCount,
      };
    });
  }, [destructivePanel, primary, surfacePanel]);
}
