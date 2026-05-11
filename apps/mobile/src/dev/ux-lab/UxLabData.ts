import type {
  UxLabChannel,
  UxLabCommunity,
  UxLabDmThread,
  UxLabFriend,
  UxLabMessage,
  UxLabNotification,
} from "./UxLabTypes";

export const uxLabCommunities: UxLabCommunity[] = [
  {
    id: "haven-dev",
    name: "Haven Development",
    description:
      "Product, mobile polish, release planning, and late-night ideas.",
    unreadCount: 7,
    accent: "H",
  },
  {
    id: "design-lab",
    name: "Design Lab",
    description:
      "Interaction studies, theme experiments, and critique threads.",
    unreadCount: 2,
    accent: "D",
  },
  {
    id: "founders",
    name: "Founders",
    description: "Strategy notes and quick async decisions.",
    unreadCount: 0,
    accent: "F",
  },
];

export const uxLabChannels: UxLabChannel[] = [
  {
    id: "general",
    communityId: "haven-dev",
    name: "general",
    unreadCount: 3,
    topic: "Daily pulse and shared context.",
  },
  {
    id: "mobile",
    communityId: "haven-dev",
    name: "mobile",
    unreadCount: 4,
    topic: "Navigation, keyboard behavior, theming, and composer feel.",
  },
  {
    id: "visual-systems",
    communityId: "design-lab",
    name: "visual-systems",
    unreadCount: 2,
    topic: "Surfaces, hierarchy, motion, and theme response.",
  },
  {
    id: "roadmap",
    communityId: "founders",
    name: "roadmap",
    unreadCount: 0,
    topic: "What ships next and what waits.",
  },
];

export const uxLabMessages: UxLabMessage[] = [
  {
    id: "m1",
    channelId: "general",
    author: "Cody",
    body: "The lab should feel disposable, but every interaction needs to be real enough to judge.",
    timestamp: "6:12 PM",
    kind: "highlight",
  },
  {
    id: "m2",
    channelId: "general",
    author: "Mira",
    body: "Try a few navigation shapes before wiring anything into production. The wrong shell is expensive later.",
    timestamp: "6:14 PM",
  },
  {
    id: "m3",
    channelId: "mobile",
    author: "Ari",
    body: "Composer should be reachable, channel switcher should feel one gesture away, and settings cannot crowd the main path.",
    timestamp: "6:18 PM",
  },
  {
    id: "m4",
    channelId: "visual-systems",
    author: "System",
    body: "Theme changed to Winter for contrast testing.",
    timestamp: "6:19 PM",
    kind: "system",
  },
  {
    id: "m5",
    channelId: "roadmap",
    author: "Cody",
    body: "If the fake app feels right, the real app gets rebuilt toward it instead of guessed into place.",
    timestamp: "6:25 PM",
  },
];

export const uxLabDmThreads: UxLabDmThread[] = [
  {
    id: "dm-mira",
    name: "Mira",
    preview: "The bottom tab version feels clean, but modal DMs are faster.",
    unreadCount: 2,
    presence: "online",
  },
  {
    id: "dm-ari",
    name: "Ari",
    preview: "Can we try channel switching as an action sheet next?",
    unreadCount: 0,
    presence: "away",
  },
  {
    id: "dm-jules",
    name: "Jules",
    preview: "Settings should probably stay global.",
    unreadCount: 1,
    presence: "offline",
  },
];

export const uxLabFriends: UxLabFriend[] = [
  {
    id: "friend-mira",
    name: "Mira",
    status: "Reviewing the UX lab",
    presence: "online",
  },
  {
    id: "friend-ari",
    name: "Ari",
    status: "Testing composer motion",
    presence: "away",
  },
  { id: "friend-jules", name: "Jules", status: "Offline", presence: "offline" },
];

export const uxLabNotifications: UxLabNotification[] = [
  {
    id: "n1",
    title: "Mention in #mobile",
    body: "Ari asked about trying action-sheet channel switching.",
    surface: "community",
    unread: true,
  },
  {
    id: "n2",
    title: "Friend request",
    body: "Jules sent a request from the Design Lab.",
    surface: "friends",
    unread: true,
  },
  {
    id: "n3",
    title: "DM reply",
    body: "Mira replied to your navigation note.",
    surface: "dms",
    unread: false,
  },
];
