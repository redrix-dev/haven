import type { HavenReactCore } from "../HavenReactCore";
import { getAppHost } from "@shared/infrastructure/platform/appHost";

export type AccessRevokedInput = {
  communityId: string;
  channelId?: string | null;
  fallbackCommunityId?: string | null;
};

/** Cross-nexus command for moderation/access events. */
export function applyAccessRevoked(
  core: HavenReactCore,
  input: AccessRevokedInput,
): void {
  const { communityId, channelId, fallbackCommunityId } = input;

  if (channelId) {
    core.channels.removeChannel(channelId, communityId);
    core.messages.for(communityId).evictChannel(channelId);
  } else {
    core.messages.clearCommunity(communityId);
    core.communities.removeCommunity(communityId);
  }

  const host = getAppHost();
  if (fallbackCommunityId) {
    host.navigateToCommunity?.(fallbackCommunityId, null);
  } else {
    host.navigateToCommunity?.(communityId, null);
  }
}
