import { useEffect, useMemo } from "react";
import { hydrateCommunityPermissionsForMany } from "@shared/features/community/utils/communityPermissionsHydration";
import type { ServerSummary } from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";

export function usePermissionsReportSlice(
  userId: string | undefined,
  servers: ServerSummary[],
) {
  const core = useHavenCore();
  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();
  const serverIdsKey = useMemo(
    () => servers.map((server) => server.id).sort().join(","),
    [servers],
  );

  const managedReportServerIds = useMemo(
    () =>
      servers
        .filter(
          (server) => permissionsByCommunityId[server.id]?.canManageReports,
        )
        .map((server) => server.id),
    [permissionsByCommunityId, servers],
  );

  const serverModmailEnabled = managedReportServerIds.length > 0;

  useEffect(() => {
    if (!userId) return;
    const joinedIds = new Set(
      serverIdsKey.length > 0 ? serverIdsKey.split(",") : [],
    );
    for (const id of Object.keys(core.permissions.getPermissionsByCommunityId())) {
      if (!joinedIds.has(id)) {
        core.permissions.invalidate(id);
      }
    }
    if (joinedIds.size === 0) return;
    void hydrateCommunityPermissionsForMany(Array.from(joinedIds));
  }, [core, serverIdsKey, userId]);

  return { managedReportServerIds, serverModmailEnabled };
}
