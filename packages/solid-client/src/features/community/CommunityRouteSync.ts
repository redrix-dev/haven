import { createEffect, untrack } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { requireHavenSolidCore } from "@solid-client/core";
import { openChannelId } from "@shared/collections/session/selectors";

/**
 * The URL says where the person is; the session follows it. Opening a
 * channel loads its window. A community opened without a channel goes to the
 * channel last open there, so the app opens where it was left.
 *
 * Call once from the component that owns the /community/:communityId routes.
 */
export function createCommunityRouteSync(): void {
  const params = useParams();
  const navigate = useNavigate();
  const core = requireHavenSolidCore();

  // Track the route params only. Opening reads and writes the session and
  // messages stores, so it runs untracked (haven-solid-reactivity).
  createEffect(() => {
    const communityId = params.communityId;
    const channelId = params.channelId ?? null;
    if (!communityId) return;
    untrack(() => {
      if (channelId) {
        void core.openChannel(communityId, channelId);
        return;
      }
      void core.openCommunity(communityId);
      const last = openChannelId(core.stores.session);
      if (last && core.stores.channels.byId[last]) {
        navigate(`/community/${communityId}/channel/${last}`, {
          replace: true,
        });
      }
    });
  });
}
