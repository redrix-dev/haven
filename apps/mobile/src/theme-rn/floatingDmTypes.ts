/** Shared types for haven-rev2 floating DM bubble + theme defaults. */

export type FloatingDmChannelId = "inbox" | "modmail";

export type FloatingDmChannelConfig = {
  id: FloatingDmChannelId;
  /** Navbar / bubble chrome label (short). */
  label: string;
  /** Sheet header — maps to HavenModalShell `title` + body context. */
  sheetTitle: string;
  bubbleColor: string;
  sheetBackgroundColor: string;
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
