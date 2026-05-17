/** Shared types for floating DM bubble + theme defaults. */

export type FloatingDmChannelId = "inbox" | "modmail";

/** Ionicons glyph names used on floating bubble faces */
export type FloatingDmBubbleIconName = "mail-outline" | "shield-outline";

export type FloatingDmChannelConfig = {
  id: FloatingDmChannelId;
  /** Navbar / bubble chrome label (short). */
  label: string;
  /** Sheet header — maps to HavenModalShell `title` + body context. */
  sheetTitle: string;
  bubbleColor: string;
  sheetBackgroundColor: string;
  /**
   * Ionicons glyph centered in the floating bubble (UniWind `accent-*` on icon).
   * Defaults by channel id: inbox → mail-outline / accent-primary-foreground; modmail → shield-outline / accent-background.
   */
  bubbleIconName?: FloatingDmBubbleIconName;
  bubbleIconColorClassName?: `accent-${string}`;
  /** Optional badge; maps to dmUnread-style counts later. */
  unreadCount?: number;
};

export type FloatingDMBubbleProps = {
  /** Defaults to inbox + modmail placeholders from theme when omitted. */
  channels?: FloatingDmChannelConfig[];
  defaultChannelId?: FloatingDmChannelId;
  onOpenChange?: (isOpen: boolean) => void;
  onChannelChange?: (channelId: FloatingDmChannelId) => void;
  onRestPositionCommit?: (position: { x: number; y: number }) => void;
};
