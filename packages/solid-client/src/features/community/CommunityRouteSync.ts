import { createEffect, untrack } from "solid-js";
import { useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";

/**
 * The URL is the source of truth for which community/channel is active —
 * caches are synced FROM route params, never the other way around. This keeps
 * deep links, reloads, and (later) popout windows correct for free, and keeps
 * core.syncViewerMessagePolicy() honest (it reads communities.getActiveId()).
 *
 * Call once from the component that owns the /community/:communityId routes.
 */
export function createCommunityRouteSync(): void {
  const params = useParams();
  const core = requireHavenSolidCore();

  // Track the route params only. Every call below reads the stores it writes,
  // so it runs untracked. See haven-solid-reactivity and
  // communitySurfaces.tier2.test.ts.
  createEffect(() => {
    const communityId = params.communityId;
    const channelId = params.channelId ?? null;
    if (!communityId) return;
    untrack(() => {
      core.communities.setActiveId(communityId);
      core.channels.setActiveChannelId(channelId);
      void core.channels.ensureLoaded(communityId);
      void core.ensureCommunityPermissions(communityId);
    });
  });
}
