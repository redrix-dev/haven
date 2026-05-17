import { create } from "zustand";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";

/** Narrow dependency so the store never resolves backends from globals. */
export type CommunityElevationSource = Pick<
  CommunityDataBackend,
  "isElevatedInServer"
>;

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
  hydrationStateByServerId: {} as Record<
    string,
    "idle" | "hydrating" | "hydrated"
  >,
});

export type PermissionsStoreState = {
  permissionsByServerId: Record<string, ServerPermissions>;
  /** Cached `isElevatedInServer` per community; missing key means uncached. */
  elevatedCache: Record<string, boolean>;
  hydrationStateByServerId: Record<
    string,
    "idle" | "hydrating" | "hydrated"
  >;
  setPermissions: (serverId: string, permissions: ServerPermissions) => void;
  clearPermissions: (serverId: string) => void;
  getPermissions: (serverId: string) => ServerPermissions;
  beginHydration: (serverId: string) => void;
  commitHydration: (
    serverId: string,
    permissions: ServerPermissions,
    isElevated: boolean,
  ) => void;
  getHydrationState: (
    serverId: string,
  ) => "idle" | "hydrating" | "hydrated";
  /**
   * Resolves whether the current user is elevated (mod/admin) in the community,
   * with a per-community cache. Pass `userId` from the active session and the
   * community backend from the Haven data runtime (composition root).
   */
  ensureElevatedInServer: (
    communityId: string,
    userId: string | null | undefined,
    communityBackend: CommunityElevationSource,
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
    beginHydration: (serverId) =>
      set((state) => ({
        hydrationStateByServerId: {
          ...state.hydrationStateByServerId,
          [serverId]: "hydrating",
        },
      })),
    commitHydration: (serverId, permissions, isElevated) =>
      set((state) => ({
        permissionsByServerId: {
          ...state.permissionsByServerId,
          [serverId]: permissions,
        },
        elevatedCache: {
          ...state.elevatedCache,
          [serverId]: isElevated,
        },
        hydrationStateByServerId: {
          ...state.hydrationStateByServerId,
          [serverId]: "hydrated",
        },
      })),
    getHydrationState: (serverId) =>
      get().hydrationStateByServerId[serverId] ?? "idle",
    ensureElevatedInServer: async (communityId, userId, communityBackend) => {
      if (!communityId || !userId) return false;
      const cached = get().elevatedCache[communityId];
      if (typeof cached === "boolean") return cached;
      try {
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
    reset: () =>
      set({
        ...createDefaultPermissionsState(),
      }),
  }),
);
