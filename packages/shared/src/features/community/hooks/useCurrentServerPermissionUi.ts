import { usePermissionsStore } from "@shared/stores/permissionsStore";

/**
 * Derived UI flags from `permissionsStore` for the currently selected community.
 */
export function useCurrentServerPermissionUi(currentServerId: string | null) {
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );

  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;

  const canManageCurrentServer =
    serverPermissions.isOwner || serverPermissions.canManageServer;

  return {
    serverPermissions,
    canOpenServerSettings,
    canManageCurrentServer,
  };
}
