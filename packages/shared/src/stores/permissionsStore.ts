import { create } from "zustand";
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
});

export type PermissionsStoreState = {
  permissionsByServerId: Record<string, ServerPermissions>;
  setPermissions: (serverId: string, permissions: ServerPermissions) => void;
  clearPermissions: (serverId: string) => void;
  getPermissions: (serverId: string) => ServerPermissions;
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
        const next = { ...state.permissionsByServerId };
        delete next[serverId];
        return { permissionsByServerId: next };
      }),
    getPermissions: (serverId) =>
      get().permissionsByServerId[serverId] ?? EMPTY_SERVER_PERMISSIONS,
    reset: () => set(createDefaultPermissionsState()),
  }),
);
