/** Global nexus persistence keys — shared across mobile and Solid surfaces. */
export const NEXUS_STORAGE_KEYS = {
  communities: "haven:nexus:communities:global",
  channels: "haven:nexus:channels:global",
  notifications: "haven:nexus:notifications:global",
  directMessages: "haven:nexus:direct-messages:global",
  /** A destination link clicked while signed out; opened once after sign-in (see linkPipeline). */
  pendingLink: "haven:nexus:links:pending",
  communityMessages: (communityId: string) =>
    `haven:nexus:community-messages:${communityId}`,
} as const;
