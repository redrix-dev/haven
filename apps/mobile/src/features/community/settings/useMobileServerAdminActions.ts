import { useCallback } from "react";
import { getCommunityDataBackend, getControlPlaneBackend } from "@shared/lib/backend";
import type {
  CommunityBanItem,
  ServerInvite,
  ServerRoleItem,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

/** Backend wiring for mobile server settings via `core.admin` + uiStore. */
export function useMobileServerAdminActions(
  communityId: string | null,
  currentUserId: string | null,
  refreshServers: () => Promise<void>,
  reloadSnapshots: () => Promise<void>,
) {
  const saveServerSettings = useCallback(
    async (values: ServerSettingsUpdate) => {
      if (!communityId || !currentUserId) throw new Error("Not authenticated.");
      const trimmedName = values.name.trim();
      if (!trimmedName) throw new Error("Community name is required.");
      await getCommunityDataBackend(communityId).updateServerSettings({
        communityId,
        values: {
          name: trimmedName,
          description: values.description,
          allowPublicInvites: values.allowPublicInvites,
          requireReportReason: values.requireReportReason,
        },
      });
      await refreshServers();
      await reloadSnapshots();
    },
    [communityId, currentUserId, refreshServers, reloadSnapshots],
  );

  const updateRolePositionBatch = useCallback(
    async (orderedRoles: ServerRoleItem[]) => {
      if (!communityId) throw new Error("No community.");
      const backend = getCommunityDataBackend(communityId);
      const n = orderedRoles.length;
      for (let i = 0; i < n; i++) {
        const role = orderedRoles[i];
        const newPosition = n - 1 - i;
        if (role.position === newPosition) continue;
        await backend.updateServerRole({
          communityId,
          roleId: role.id,
          name: role.name,
          color: role.color,
          position: newPosition,
        });
      }
      await reloadSnapshots();
    },
    [communityId, reloadSnapshots],
  );

  const createInvite = useCallback(
    async (input: { maxUses: number | null; expiresInHours: number | null }) => {
      if (!communityId) throw new Error("No community.");
      const invite = await getControlPlaneBackend().createCommunityInvite({
        communityId,
        maxUses: input.maxUses,
        expiresInHours: input.expiresInHours,
      });
      await reloadSnapshots();
      return invite;
    },
    [communityId, reloadSnapshots],
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      if (!communityId) throw new Error("No community.");
      await getControlPlaneBackend().revokeCommunityInvite(communityId, inviteId);
      await reloadSnapshots();
    },
    [communityId, reloadSnapshots],
  );

  const unbanUser = useCallback(
    async (input: { targetUserId: string; reason?: string | null }) => {
      if (!communityId) throw new Error("No community.");
      await getCommunityDataBackend(communityId).unbanCommunityMember({
        communityId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });
      await reloadSnapshots();
    },
    [communityId, reloadSnapshots],
  );

  return {
    saveServerSettings,
    updateRolePositionBatch,
    createInvite,
    revokeInvite,
    unbanUser,
  };
}

export type MobileServerSnapshots = {
  settings: ServerSettingsUpdate | null;
  roles: ServerRoleItem[];
  members: import("@shared/lib/backend/types").ServerMemberRoleItem[];
  invites: ServerInvite[];
  bans: CommunityBanItem[];
  permissionsCatalog: import("@shared/lib/backend/types").PermissionCatalogItem[];
};

export async function loadMobileServerSnapshots(
  communityId: string,
  loadInvites: boolean,
): Promise<{
  snapshots: MobileServerSnapshots;
  errors: { settings?: string; roles?: string; invites?: string; bans?: string };
}> {
  const backend = getCommunityDataBackend(communityId);
  const errors: { settings?: string; roles?: string; invites?: string; bans?: string } = {};

  let settings: ServerSettingsUpdate | null = null;
  try {
    const snap = await backend.fetchServerSettings(communityId);
    settings = {
      name: snap.name,
      description: snap.description,
      allowPublicInvites: snap.allowPublicInvites,
      requireReportReason: snap.requireReportReason,
    };
  } catch (e) {
    errors.settings = getErrorMessage(e, "Failed to load settings.");
  }

  let roles: ServerRoleItem[] = [];
  let members: import("@shared/lib/backend/types").ServerMemberRoleItem[] = [];
  let permissionsCatalog: import("@shared/lib/backend/types").PermissionCatalogItem[] = [];
  try {
    const rm = await backend.fetchServerRoleManagement(communityId);
    roles = rm.roles;
    members = rm.members;
    permissionsCatalog = rm.permissionsCatalog;
  } catch (e) {
    errors.roles = getErrorMessage(e, "Failed to load roles.");
  }

  let invites: ServerInvite[] = [];
  if (loadInvites) {
    try {
      invites = await getControlPlaneBackend().listActiveCommunityInvites(communityId);
    } catch (e) {
      errors.invites = getErrorMessage(e, "Failed to load invites.");
    }
  }

  let bans: CommunityBanItem[] = [];
  try {
    bans = await backend.listCommunityBans(communityId);
  } catch (e) {
    errors.bans = getErrorMessage(e, "Failed to load bans.");
  }

  return {
    snapshots: { settings, roles, members, invites, bans, permissionsCatalog },
    errors,
  };
}
