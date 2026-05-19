import { useHavenCore } from "@shared/core";

/**
 * Derived UI flags from PermissionsNexus for the currently selected community.
 */
export function useCurrentServerPermissionUi(currentServerId: string | null) {
  const core = useHavenCore();
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");

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
