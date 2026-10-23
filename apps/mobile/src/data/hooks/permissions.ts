import type { PermissionsReactNexus } from "../permissions/permissionsReactNexus";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";
import { useStoreSelector } from "./useStoreSelector";

export function usePermissions(
  nexus: PermissionsReactNexus,
  communityId: string,
): ServerPermissions {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS,
  );
}

export function usePermissionsByCommunityId(
  nexus: PermissionsReactNexus,
): Record<string, ServerPermissions> {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.permissionsByCommunityId,
  );
}
