import { create } from "zustand";
import { getCommunityDataBackend } from "@shared/lib/backend";
import type { ServerPermissions } from "@shared/lib/backend/types";

const EMPTY_SERVER_PERMISSIONS: ServerPermissions = {
  isOwner: false,
  canManageServer: false,
  canManageRoles: false,
  canManageMembers: false,
  canCreateChannels: false,
  canManageChannelStructure: false,
  canManageChannelPermissions: false,
  canManageMessages: false,
  canManageBans: false,
  canViewBanHidden: false,
  canCreateReports: false,
  canManageReports: false,
  canRefreshLinkPreviews: false,
  canManageInvites: false,
};

const createDefaultPermissionsState = () => ({
  permissionsByServerId: {} as Record<string, ServerPermissions>,
  elevatedCache: {} as Record<string, boolean>,
});

export type PermissionsStoreState = {
  permissionsByServerId: Record<string, ServerPermissions>;
  /** Cached `isElevatedInServer` per community; missing key means uncached. */
  elevatedCache: Record<string, boolean>;
  setPermissions: (serverId: string, permissions: ServerPermissions) => void;
  clearPermissions: (serverId: string) => void;
  getPermissions: (serverId: string) => ServerPermissions;
  /**
   * Resolves whether the current user is elevated (mod/admin) in the community,
   * with a per-community cache. Pass `userId` from the active session.
   */
  ensureElevatedInServer: (
    communityId: string,
    userId: string | null | undefined,
  ) => Promise<boolean>;
  invalidateElevatedForServer: (serverId: string) => void;
  invalidateAllElevated: () => void;
  reset: () => void;
};

export const usePermissionsStore = create<PermissionsStoreState>()(
  (set, get) => ({
    ...createDefaultPermissionsState(),
    setPermissions: (serverId, permissions) =>
      set((state) => ({
        permissionsByServerId: {
          ...state.permissionsByServerId,
          [serverId]: permissions,
        },
      })),
    clearPermissions: (serverId) =>
      set((state) => {
        const nextPerms = { ...state.permissionsByServerId };
        delete nextPerms[serverId];
        const nextElev = { ...state.elevatedCache };
        delete nextElev[serverId];
        return { permissionsByServerId: nextPerms, elevatedCache: nextElev };
      }),
    getPermissions: (serverId) =>
      get().permissionsByServerId[serverId] ?? EMPTY_SERVER_PERMISSIONS,
    ensureElevatedInServer: async (communityId, userId) => {
      if (!communityId || !userId) return false;
      const cached = get().elevatedCache[communityId];
      if (typeof cached === "boolean") return cached;
      try {
        const communityBackend = getCommunityDataBackend(communityId);
        const nextValue = await communityBackend.isElevatedInServer(
          communityId,
        );
        set((state) => ({
          elevatedCache: {
            ...state.elevatedCache,
            [communityId]: nextValue,
          },
        }));
        return nextValue;
      } catch (error) {
        console.error("Failed to resolve elevated status for server:", error);
        return false;
      }
    },
    invalidateElevatedForServer: (serverId) =>
      set((state) => {
        const next = { ...state.elevatedCache };
        delete next[serverId];
        return { elevatedCache: next };
      }),
    invalidateAllElevated: () => set({ elevatedCache: {} }),
    reset: () => set(createDefaultPermissionsState()),
  }),
);
