import type { PermissionsNexus } from "../permissions/PermissionsNexus";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";
import { useStoreSelector } from "./useStoreSelector";

export function usePermissions(
  nexus: PermissionsNexus,
  communityId: string,
): ServerPermissions {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS,
  );
}

export function usePermissionsByCommunityId(
  nexus: PermissionsNexus,
): Record<string, ServerPermissions> {
  return useStoreSelector(nexus.reactiveStore, (state) => {
    void state.revision;
    return state.permissionsByCommunityId;
  });
}
