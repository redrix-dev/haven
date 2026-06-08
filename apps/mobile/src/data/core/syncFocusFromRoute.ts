import type { HavenReactCore } from "./HavenReactCore";
import {
  getCachedChannelsForServer,
  resolvePreferredChannelIdForServer,
} from "@shared/core/communityChannelUtils";

export type FocusFromRouteInput = {
  communityId: string | null;
  channelId?: string | null;
};

export type ApplyCommunityFocusOptions = {
  lastVisitedChannelId?: string | null;
  previousChannelId?: string | null;
};

/** Apply the router's current screen context onto the nexus focus. */
export function syncFocusFromRoute(
  core: HavenReactCore,
  input: FocusFromRouteInput,
): void {
  const { communityId, channelId } = input;
  core.communities.setActiveId(communityId ?? null);

  if (!communityId) {
    core.channels.setActiveChannelId(null);
    return;
  }

  let resolvedChannelId: string | null = null;

  if (channelId) {
    core.channels.setActiveChannelId(channelId);
    resolvedChannelId = channelId;
  } else {
    const last = core.channels.getLastChannelId(communityId);
    if (last) {
      core.channels.setActiveChannelId(last);
      resolvedChannelId = last;
    } else {
      const fallback = core.channels.getDefaultChannelId(communityId);
      core.channels.setActiveChannelId(fallback);
      resolvedChannelId = fallback;
    }
  }

  if (!resolvedChannelId) return;

  void core.prepareTextChannelMessages(communityId, resolvedChannelId);
}

export function applyCommunityFocus(
  core: HavenReactCore,
  serverId: string,
  options?: ApplyCommunityFocusOptions,
): string | null {
  const cached = getCachedChannelsForServer(
    core.channels.getChannelsSnapshot(serverId),
  );
  const channelList = cached ?? [];
  const channelId =
    channelList.length > 0
      ? resolvePreferredChannelIdForServer(channelList, {
          lastVisitedChannelId: options?.lastVisitedChannelId,
          previousChannelId:
            options?.previousChannelId ?? core.channels.getActiveChannelId(),
          lastChannelId: core.channels.getLastChannelId(serverId),
          defaultChannelId: core.channels.getDefaultChannelId(serverId),
        })
      : (options?.lastVisitedChannelId ?? null);

  syncFocusFromRoute(core, {
    communityId: serverId,
    channelId: channelId ?? undefined,
  });
  return core.channels.getActiveChannelId();
}
