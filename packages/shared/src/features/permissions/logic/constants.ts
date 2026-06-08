import type { ServerPermissions } from "@shared/lib/backend/types";

export const EMPTY_PERMISSIONS: ServerPermissions = {
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
