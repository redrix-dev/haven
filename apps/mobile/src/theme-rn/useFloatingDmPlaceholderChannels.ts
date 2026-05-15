import { useMemo } from "react";
import { useCSSVariable } from "uniwind";
import type { FloatingDmChannelConfig, FloatingDmChannelId } from "@/theme-rn/floatingDmTypes";

type ChannelSeed = {
  id: FloatingDmChannelId;
  label: string;
  sheetTitle: string;
  unreadCount: number;
};

const SEEDS: readonly ChannelSeed[] = [
  { id: "inbox", label: "Inbox", sheetTitle: "Direct messages", unreadCount: 2 },
  { id: "modmail", label: "Mod mail", sheetTitle: "Moderator inbox", unreadCount: 0 },
];

/**
 * Default floating DM channel chrome derived from UniWind theme variables.
 */
export function useFloatingDmPlaceholderChannels(): FloatingDmChannelConfig[] {
  const primary = useCSSVariable("--primary");
  const surfacePanel = useCSSVariable("--surface-panel");
  const accentAmber = useCSSVariable("--accent-amber");
  const destructivePanel = useCSSVariable("--surface-destructive-panel");

  return useMemo(() => {
    const inboxBubble = typeof primary === "string" ? primary : "#3f79d8";
    const inboxSheet = typeof surfacePanel === "string" ? surfacePanel : "#142033";
    const modBubble = typeof accentAmber === "string" ? accentAmber : "#d6a24a";
    const modSheet =
      typeof destructivePanel === "string" ? destructivePanel : "#2a1821";

    return SEEDS.map((seed, index) => {
      const bubbleColor = index === 0 ? inboxBubble : modBubble;
      const sheetBackgroundColor = index === 0 ? inboxSheet : modSheet;
      return {
        id: seed.id,
        label: seed.label,
        sheetTitle: seed.sheetTitle,
        bubbleColor,
        sheetBackgroundColor,
        unreadCount: seed.unreadCount,
      };
    });
  }, [accentAmber, destructivePanel, primary, surfacePanel]);
}
