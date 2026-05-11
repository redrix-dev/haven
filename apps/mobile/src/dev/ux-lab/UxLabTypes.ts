export type UxLabSurface =
  | "home"
  | "community"
  | "dms"
  | "friends"
  | "notifications"
  | "settings"
  | "profile"
  | "themeSpecimen";

export type UxLabCommunity = {
  id: string;
  name: string;
  description: string;
  unreadCount: number;
  accent: string;
};

export type UxLabChannel = {
  id: string;
  communityId: string;
  name: string;
  unreadCount: number;
  topic: string;
};

export type UxLabMessage = {
  id: string;
  channelId: string;
  author: string;
  body: string;
  timestamp: string;
  kind?: "default" | "system" | "highlight";
};

export type UxLabDmThread = {
  id: string;
  name: string;
  preview: string;
  unreadCount: number;
  presence: "online" | "away" | "offline";
};

export type UxLabFriend = {
  id: string;
  name: string;
  status: string;
  presence: "online" | "away" | "offline";
};

export type UxLabNotification = {
  id: string;
  title: string;
  body: string;
  surface: UxLabSurface;
  unread: boolean;
};
