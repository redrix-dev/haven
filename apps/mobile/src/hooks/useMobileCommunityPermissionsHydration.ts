import { useEffect, useMemo } from "react";
import { hydrateCommunityPermissionsForMany } from "@shared/features/community/communityPermissionsHydration";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useServersStore } from "@shared/stores/serversStore";

/**
 * Keeps `permissionsStore` in sync with joined communities (same pattern as desktop
 * `usePermissionsReportSlice` / chat app lifecycle).
 */
export function useMobileCommunityPermissionsHydration(userId: string | undefined) {
  const servers = useServersStore((s) => s.servers);
  const serverIdsKey = useMemo(() => servers.map((s) => s.id).sort().join(","), [servers]);

  useEffect(() => {
    if (!userId) return;

    const joinedIds = new Set(servers.map((s) => s.id));
    const { permissionsByServerId, clearPermissions } = usePermissionsStore.getState();
    for (const id of Object.keys(permissionsByServerId)) {
      if (!joinedIds.has(id)) {
        clearPermissions(id);
      }
    }

    if (servers.length === 0) return;
    void hydrateCommunityPermissionsForMany(servers.map((s) => s.id));
  }, [userId, serverIdsKey, servers]);
}
