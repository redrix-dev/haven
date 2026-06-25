import type {
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelRolePermissionItem,
  CommunityBanItem,
  CommunityMemberListItem,
  PermissionCatalogItem,
  ServerInvite,
  ServerMemberRoleItem,
  ServerRoleItem,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";

export type CommunityAdminMembersModalState = {
  showMembersModal: boolean;
  membersModalCommunityId: string | null;
  membersModalServerName: string;
  membersModalMembers: CommunityMemberListItem[];
  membersModalLoading: boolean;
  membersModalError: string | null;
  membersModalCanCreateReports: boolean;
  membersModalCanManageMembers: boolean;
  membersModalCanManageBans: boolean;
};

export type CommunityAdminServerPanelState = {
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
  serverSettingsInitialValues: ServerSettingsUpdate | null;
  serverSettingsLoading: boolean;
  serverSettingsLoadError: string | null;
};

export type CommunityAdminChannelPermissionsState = {
  channelRolePermissions: ChannelRolePermissionItem[];
  channelMemberPermissions: ChannelMemberPermissionItem[];
  channelPermissionMemberOptions: ChannelMemberOption[];
  channelPermissionsLoading: boolean;
  channelPermissionsLoadError: string | null;
};

export type CommunityAdminNexusState = CommunityAdminMembersModalState &
  CommunityAdminServerPanelState &
  CommunityAdminChannelPermissionsState & {
    revision: number;
  };
