/** Views over `ChannelsState`, worked out when read. Both platforms use these. */

import type { Channel } from "@shared/lib/backend/records";
import type { ChannelsState } from "./channels";

/** A community's channels in the order its managers set. */
export function communityChannels(
  state: ChannelsState,
  communityId: string,
): Channel[] {
  return Object.values(state.byId)
    .filter((channel) => channel.community_id === communityId)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

/** Conversations, the most recently active first; ones never used last. */
export function conversations(state: ChannelsState): Channel[] {
  return Object.values(state.byId)
    .filter((channel) => channel.kind === "dm")
    .sort((a, b) => {
      const left = a.latest_message_id ?? "";
      const right = b.latest_message_id ?? "";
      if (left !== right) return left < right ? 1 : -1;
      return a.id < b.id ? -1 : 1;
    });
}

/** The other person in a conversation. */
export function otherPerson(
  state: ChannelsState,
  channelId: string,
  myId: string,
): string | null {
  return state.participants[channelId]?.find((id) => id !== myId) ?? null;
}

export function unreadCount(state: ChannelsState, channelId: string): number {
  return state.unread[channelId] ?? 0;
}

export function isMuted(
  state: ChannelsState,
  channelId: string,
  now: number = Date.now(),
): boolean {
  const until = state.mine[channelId]?.muted_until;
  return until != null && Date.parse(until) > now;
}
