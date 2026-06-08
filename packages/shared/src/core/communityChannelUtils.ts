import type { Channel } from "@shared/lib/backend/types";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";

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
  channelsSnapshot: readonly HavenChannel[],
): Channel[] | null {
  if (channelsSnapshot.length === 0) return null;
  return channelsSnapshot.map(toChannel);
}

export type ResolvePreferredChannelOptions = {
  lastVisitedChannelId?: string | null;
  previousChannelId?: string | null;
  lastChannelId?: string | null;
  defaultChannelId?: string | null;
};

export function resolvePreferredChannelIdForServer(
  channelList: Channel[],
  options?: ResolvePreferredChannelOptions,
): string | null {
  if (channelList.length === 0) return null;

  const remembered = options?.lastChannelId ?? null;
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
    options?.defaultChannelId ??
    channelList[0]?.id ??
    null
  );
}
