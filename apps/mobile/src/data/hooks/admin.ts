import { shallow } from "zustand/shallow";
import type { CommunityAdminReactNexus } from "../community-management/communityAdminReactNexus";
import type {
  CommunityBanItem,
  PermissionCatalogItem,
  ServerInvite,
  ServerMemberRoleItem,
  ServerRoleItem,
  ServerSettingsSnapshot,
} from "@shared/lib/backend/types";
import { useStoreSelector } from "./useStoreSelector";

/** What the community settings screen shows for one community. */
export type ServerPanelState = {
  communityBans: CommunityBanItem[];
  communityBansLoading: boolean;
  communityBansError: string | null;
  serverInvites: ServerInvite[];
  serverInvitesLoading: boolean;
  serverInvitesError: string | null;
  serverRoles: ServerRoleItem[];
  serverMembers: ServerMemberRoleItem[];
  serverPermissionCatalog: PermissionCatalogItem[];
  serverRoleManagementLoading: boolean;
  serverRoleManagementError: string | null;
  serverSettingsInitialValues: ServerSettingsSnapshot | null;
  serverSettingsLoading: boolean;
  serverSettingsLoadError: string | null;
};

const NO_BANS: CommunityBanItem[] = [];
const NO_INVITES: ServerInvite[] = [];
const NO_ROLES: ServerRoleItem[] = [];
const NO_MEMBERS: ServerMemberRoleItem[] = [];
const NO_PERMISSIONS: PermissionCatalogItem[] = [];

export function useServerPanelState(
  nexus: CommunityAdminReactNexus,
  communityId: string,
): ServerPanelState {
  return useStoreSelector(
    nexus.reactiveStore,
    ({ loading, errors, ...state }) => {
      const roles = state.rolesByCommunity[communityId];
      return {
        communityBans: state.bansByCommunity[communityId] ?? NO_BANS,
        communityBansLoading: loading.bans[communityId] ?? false,
        communityBansError: errors.bans[communityId] ?? null,
        serverInvites: state.invitesByCommunity[communityId] ?? NO_INVITES,
        serverInvitesLoading: loading.invites[communityId] ?? false,
        serverInvitesError: errors.invites[communityId] ?? null,
        serverRoles: roles?.roles ?? NO_ROLES,
        serverMembers: roles?.members ?? NO_MEMBERS,
        serverPermissionCatalog: roles?.permissionsCatalog ?? NO_PERMISSIONS,
        serverRoleManagementLoading: loading.roles[communityId] ?? false,
        serverRoleManagementError: errors.roles[communityId] ?? null,
        serverSettingsInitialValues:
          state.settingsByCommunity[communityId] ?? null,
        serverSettingsLoading: loading.settings[communityId] ?? false,
        serverSettingsLoadError: errors.settings[communityId] ?? null,
      };
    },
    shallow,
  );
}
