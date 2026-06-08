import type { CommunityAdminNexus } from "../community/CommunityAdminNexus";
import type {
  CommunityAdminChannelPermissionsState,
  CommunityAdminServerPanelState,
} from "@shared/nexus/community/communityAdminTypes";
import { useStoreSelector } from "./useStoreSelector";

export function useChannelPermissionsState(
  nexus: CommunityAdminNexus,
): CommunityAdminChannelPermissionsState {
  return useStoreSelector(nexus.reactiveStore, (state) => ({
    channelRolePermissions: state.channelRolePermissions,
    channelMemberPermissions: state.channelMemberPermissions,
    channelPermissionMemberOptions: state.channelPermissionMemberOptions,
    channelPermissionsLoading: state.channelPermissionsLoading,
    channelPermissionsLoadError: state.channelPermissionsLoadError,
  }));
}

export function useServerPanelState(
  nexus: CommunityAdminNexus,
): CommunityAdminServerPanelState {
  return useStoreSelector(nexus.reactiveStore, (state) => ({
    communityBans: state.communityBans,
    communityBansLoading: state.communityBansLoading,
    communityBansError: state.communityBansError,
    serverInvites: state.serverInvites,
    serverInvitesLoading: state.serverInvitesLoading,
    serverInvitesError: state.serverInvitesError,
    serverRoles: state.serverRoles,
    serverMembers: state.serverMembers,
    serverPermissionCatalog: state.serverPermissionCatalog,
    serverRoleManagementLoading: state.serverRoleManagementLoading,
    serverRoleManagementError: state.serverRoleManagementError,
    serverSettingsInitialValues: state.serverSettingsInitialValues,
    serverSettingsLoading: state.serverSettingsLoading,
    serverSettingsLoadError: state.serverSettingsLoadError,
  }));
}
