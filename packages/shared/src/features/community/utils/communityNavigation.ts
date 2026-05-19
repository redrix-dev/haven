import {
  getCachedChannelsForServer,
  resolvePreferredChannelIdForServer,
} from "@shared/features/community/hooks/useCommunityWorkspace";
import { useNavigationStore } from "@shared/stores/navigationStore";

export type ApplyCommunityNavigationTargetOptions = {
  lastVisitedChannelId?: string | null;
  previousChannelId?: string | null;
};

/**
 * Resolves preferred text channel from cross-session channel cache and updates
 * navigation store in one write (server + channel).
 */
export function applyCommunityNavigationTarget(
  serverId: string,
  options?: ApplyCommunityNavigationTargetOptions,
): string | null {
  const cached = getCachedChannelsForServer(serverId);
  const channelList = cached ?? [];
  const channelId =
    channelList.length > 0
      ? resolvePreferredChannelIdForServer(serverId, channelList, {
          lastVisitedChannelId: options?.lastVisitedChannelId,
          previousChannelId:
            options?.previousChannelId ??
            useNavigationStore.getState().currentChannelId,
        })
      : null;

  useNavigationStore.getState().setCommunityNavigation(serverId, channelId);
  return channelId;
}
