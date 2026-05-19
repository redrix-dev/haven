import { useEffect, useMemo } from "react";
import { hydrateCommunityPermissionsForMany } from "@shared/features/community/utils/communityPermissionsHydration";
import type { ServerSummary } from "@shared/lib/backend/types";
import { usePermissionsStore } from "@shared/stores/permissionsStore";

export function usePermissionsReportSlice(
  userId: string | undefined,
  servers: ServerSummary[],
) {
  const permissionsByServerId = usePermissionsStore(
    (state) => state.permissionsByServerId,
  );

  const managedReportServerIds = useMemo(
    () =>
      servers
        .filter(
          (server) => permissionsByServerId[server.id]?.canManageReports,
        )
        .map((server) => server.id),
    [permissionsByServerId, servers],
  );

  const serverModmailEnabled = managedReportServerIds.length > 0;

  useEffect(() => {
    if (!userId) return;
    const joinedIds = new Set(servers.map((s) => s.id));
    const { permissionsByServerId: byId, clearPermissions } =
      usePermissionsStore.getState();
    for (const id of Object.keys(byId)) {
      if (!joinedIds.has(id)) clearPermissions(id);
    }
    if (servers.length === 0) return;
    void hydrateCommunityPermissionsForMany(servers.map((s) => s.id));
  }, [servers, userId]);

  return { managedReportServerIds, serverModmailEnabled };
}
