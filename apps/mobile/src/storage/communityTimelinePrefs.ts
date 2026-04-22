/**
 * Per-channel scroll restore for community message lists (mobile only).
 *
 * Rules:
 * - Session-only (in-memory). No AsyncStorage — avoids stale anchors across days,
 *   async write races, and "never forgets" bugs from overlapping saves.
 * - We only restore when the user leaves a channel while scrolled away from the bottom.
 * - Leaving at the bottom clears any restore hint so the next visit starts at newest.
 */

export type ChannelScrollExit = {
  wasNearBottom: boolean;
  anchorMessageId: string | null;
  anchorOffsetY?: number;
};

const sessionExitByChannel = new Map<string, ChannelScrollExit>();

function channelKey(communityId: string, channelId: string): string {
  return `${communityId}\u0000${channelId}`;
}

/** Read restore hint for the current app session (sync). */
export function peekChannelScrollExit(
  communityId: string,
  channelId: string,
): ChannelScrollExit | null {
  const hit = sessionExitByChannel.get(channelKey(communityId, channelId));
  return hit ? { ...hit } : null;
}

/**
 * Record how the user left a channel. When they left at the bottom, the entry is removed
 * so the next open always uses "newest first" without a stale mid-list anchor.
 */
export function commitChannelScrollExit(
  communityId: string,
  channelId: string,
  exit: ChannelScrollExit,
): void {
  const key = channelKey(communityId, channelId);
  if (exit.wasNearBottom) {
    sessionExitByChannel.delete(key);
    return;
  }
  sessionExitByChannel.set(key, {
    wasNearBottom: false,
    anchorMessageId: exit.anchorMessageId,
    anchorOffsetY: typeof exit.anchorOffsetY === "number" ? exit.anchorOffsetY : undefined,
  });
}

export function clearAllChannelScrollExits(): void {
  sessionExitByChannel.clear();
}
