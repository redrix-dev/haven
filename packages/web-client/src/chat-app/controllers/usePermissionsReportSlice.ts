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
    const joinedIds = new Set(servers.map((server) => server.id));
    for (const id of Object.keys(core.permissions.getPermissionsByCommunityId())) {
      if (!joinedIds.has(id)) {
        core.permissions.invalidate(id);
      }
    }
    if (servers.length === 0) return;
    void hydrateCommunityPermissionsForMany(servers.map((server) => server.id));
  }, [core, servers, userId]);

  return { managedReportServerIds, serverModmailEnabled };
}
