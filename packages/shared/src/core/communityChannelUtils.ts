import type { Channel } from "@shared/lib/backend/types";
import type { HavenChannel } from "@shared/nexus/community/ChannelNexus";
import type { HavenCore } from "./HavenCore";

export const toChannel = (channel: HavenChannel): Channel =>
  ({
    id: channel.id,
    community_id: channel.communityId,
    name: channel.name,
    kind: channel.kind,
    position: channel.position,
    topic: channel.topic,
    created_at: channel.createdAt,
  }) as unknown as Channel;

export function getCachedChannelsForServer(
  core: HavenCore,
  serverId: string,
): Channel[] | null {
  const snapshot = core.channels.getChannelsSnapshot(serverId);
  if (snapshot.length === 0) return null;
  return snapshot.map(toChannel);
}

export function resolvePreferredChannelIdForServer(
  core: HavenCore,
  serverId: string,
  channelList: Channel[],
  options?: {
    lastVisitedChannelId?: string | null;
    previousChannelId?: string | null;
  },
): string | null {
  if (channelList.length === 0) return null;

  const remembered = core.channels.getLastChannelId(serverId);
  const previousValid =
    options?.previousChannelId &&
    channelList.some((channel) => channel.id === options.previousChannelId)
      ? options.previousChannelId!
      : null;

  const candidates = [
    options?.lastVisitedChannelId ?? null,
    remembered,
    previousValid,
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      channelList.some((channel) => channel.id === candidate)
    ) {
      return candidate;
    }
  }
  return (
    core.channels.getDefaultChannelId(serverId) ??
    channelList[0]?.id ??
    null
  );
}
