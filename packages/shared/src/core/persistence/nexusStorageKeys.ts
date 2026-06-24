/** Global nexus persistence keys — shared across mobile and Solid surfaces. */
export const NEXUS_STORAGE_KEYS = {
  communities: "haven:nexus:communities:global",
  channels: "haven:nexus:channels:global",
  notifications: "haven:nexus:notifications:global",
  directMessages: "haven:nexus:direct-messages:global",
  communityMessages: (communityId: string) =>
    `haven:nexus:community-messages:${communityId}`,
} as const;
