import { useEffect, useMemo } from "react";
import { hydrateCommunityPermissionsForMany } from "@shared/features/community/communityPermissionsHydration";
import { useHavenCore } from "@shared/core";

/**
 * Keeps PermissionsNexus in sync with joined communities (same pattern as desktop
 * `usePermissionsReportSlice` / chat app lifecycle).
 */
export function useMobileCommunityPermissionsHydration(userId: string | undefined) {
  const core = useHavenCore();
  const communities = core.communities.useCommunities();
  const serverIdsKey = useMemo(
    () => communities.map((community) => community.id).sort().join(","),
    [communities],
  );

  useEffect(() => {
    if (!userId) return;

    const joinedIds = new Set(communities.map((community) => community.id));
    for (const id of Object.keys(core.permissions.getPermissionsByCommunityId())) {
      if (!joinedIds.has(id)) {
        core.permissions.invalidate(id);
      }
    }

    if (communities.length === 0) return;
    void hydrateCommunityPermissionsForMany(
      communities.map((community) => community.id),
    );
  }, [communities, core, serverIdsKey, userId]);
}
