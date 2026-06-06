import type { HavenCore } from "./HavenCore";
import {
  getCachedChannelsForServer,
  resolvePreferredChannelIdForServer,
} from "./communityChannelUtils";

export type FocusFromRouteInput = {
  communityId: string | null;
  channelId?: string | null;
};

export type ApplyCommunityFocusOptions = {
  lastVisitedChannelId?: string | null;
  previousChannelId?: string | null;
};

/**
 * Apply the router's current screen context onto the nexus focus.
 * Called by mobile `CommunityShell` on screen focus and by web shell on URL change.
 *
 * If channelId is omitted, the nexus picks the last visited channel for the
 * community (persisted via ChannelNexus.lastChannelByCommunity) and falls back
 * to the first text channel.
 */
export function syncFocusFromRoute(
  core: HavenCore,
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

/**
 * Sync community + channel focus from route context, resolving a preferred
 * channel when the caller has a loaded channel list.
 */
export function applyCommunityFocus(
  core: HavenCore,
  serverId: string,
  options?: ApplyCommunityFocusOptions,
): string | null {
  const cached = getCachedChannelsForServer(core, serverId);
  const channelList = cached ?? [];
  const channelId =
    channelList.length > 0
      ? resolvePreferredChannelIdForServer(core, serverId, channelList, {
          lastVisitedChannelId: options?.lastVisitedChannelId,
          previousChannelId:
            options?.previousChannelId ??
            core.channels.getActiveChannelId(),
        })
      : (options?.lastVisitedChannelId ?? null);

  syncFocusFromRoute(core, {
    communityId: serverId,
    channelId: channelId ?? undefined,
  });
  return core.channels.getActiveChannelId();
}
