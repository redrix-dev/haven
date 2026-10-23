import type {
  CommunityBanItem,
  CommunityMemberListItem,
  ServerInvite,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
} from "@shared/lib/backend/types";

/** The per-community things an admin screen loads. */
export type AdminResource =
  | "members"
  | "bans"
  | "roles"
  | "settings"
  | "invites";

/**
 * Community administration, cached per community. Each resource keeps its
 * data plus a loading flag and the last load error, all keyed by community id.
 */
export type CommunityAdminState = {
  membersByCommunity: Record<string, CommunityMemberListItem[]>;
  bansByCommunity: Record<string, CommunityBanItem[]>;
  rolesByCommunity: Record<string, ServerRoleManagementSnapshot>;
  settingsByCommunity: Record<string, ServerSettingsSnapshot>;
  invitesByCommunity: Record<string, ServerInvite[]>;
  loading: Record<AdminResource, Record<string, boolean>>;
  errors: Record<AdminResource, Record<string, string | null>>;
};
