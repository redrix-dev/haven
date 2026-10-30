/**
 * Community members and the viewer's own standing: permissions, the member
 * list, bans, kicks.
 */
import { havenCommunitySb } from "./runtime";
import { asOptionalString } from "./rows";
import type { CommunityMemberWithProfile } from "./rows";
import type {
  BanCommunityMemberResult,
  CommunityBanItem,
  CommunityMemberListItem,
  ServerPermissions,
  KickCommunityMemberResult,
} from "../types";

export interface CommunityMemberBackend {
  getMyPermissions(
    communityId: string,
  ): Promise<ServerPermissions & { isElevated: boolean }>;
  listCommunityMembers(communityId: string): Promise<CommunityMemberListItem[]>;
  listCommunityBans(communityId: string): Promise<CommunityBanItem[]>;
  banCommunityMember(input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<BanCommunityMemberResult>;
  kickCommunityMember(input: {
    communityId: string;
    targetUserId: string;
  }): Promise<KickCommunityMemberResult>;
  unbanCommunityMember(input: {
    communityId: string;
    targetUserId: string;
    reason?: string | null;
  }): Promise<void>;
  /** Resolves the signed-in user's `community_members` row id and assigned `role_id`s in this community. */
  fetchMyMemberRoleAssignmentForRealtime(
    communityId: string,
    userId: string,
  ): Promise<{ memberId: string; roleIds: string[] } | null>;
  isElevatedInServer(communityId: string): Promise<boolean>;
  canSendInChannel(channelId: string): Promise<boolean>;
}

type BanCommunityMemberRpcRow = {
  banned_user_id?: unknown;
  community_id?: unknown;
};

type KickCommunityMemberRpcRow = {
  kicked_user_id?: unknown;
  community_id?: unknown;
};

type ListCommunityBansRpcRow = {
  id?: unknown;
  community_id?: unknown;
  banned_user_id?: unknown;
  banned_by_user_id?: unknown;
  reason?: unknown;
  banned_at?: unknown;
  revoked_at?: unknown;
  revoked_by_user_id?: unknown;
  revoked_reason?: unknown;
  username?: unknown;
  avatar_url?: unknown;
};

export const communityMemberBackend: CommunityMemberBackend = {
  async getMyPermissions(communityId) {
    const allFalse: ServerPermissions & { isElevated: boolean } = {
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
      isElevated: false,
    };

    const { data, error } = await havenCommunitySb().rpc(
      "get_my_community_permissions" as never,
      { p_community_id: communityId } as never,
    );

    if (error) return allFalse;

    const row = Array.isArray(data) ? data[0] : data;
    if (row == null || typeof row !== "object") return allFalse;

    const r = row as Record<string, unknown>;
    const bool = (key: string) => Boolean(r[key]);

    return {
      isOwner: bool("is_owner"),
      canManageServer: bool("can_manage_server"),
      canManageRoles: bool("can_manage_roles"),
      canManageMembers: bool("can_manage_members"),
      canCreateChannels: bool("can_create_channels"),
      canManageChannelStructure: bool("can_manage_channel_structure"),
      canManageChannelPermissions: bool("can_manage_channel_permissions"),
      canManageMessages: bool("can_manage_messages"),
      canManageBans: bool("can_manage_bans"),
      canViewBanHidden: bool("can_view_ban_hidden"),
      canCreateReports: bool("can_create_reports"),
      canManageReports: bool("can_manage_reports"),
      canRefreshLinkPreviews: bool("can_refresh_link_previews"),
      canManageInvites: bool("can_manage_invites"),
      isElevated: bool("is_elevated"),
    };
  },

  async listCommunityMembers(communityId) {
    const { data, error } = await havenCommunitySb()
      .from("community_members")
      .select(
        "id, user_id, nickname, is_owner, joined_at, profiles(username, avatar_url)",
      )
      .eq("community_id", communityId)
      .order("joined_at", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as CommunityMemberWithProfile[];
    return rows
      .map((member) => {
        const profile = Array.isArray(member.profiles)
          ? member.profiles[0]
          : member.profiles;
        const displayName =
          member.nickname?.trim() ||
          profile?.username ||
          member.user_id.substring(0, 12);

        return {
          memberId: member.id,
          userId: member.user_id,
          displayName,
          avatarUrl: profile?.avatar_url ?? null,
          isOwner: Boolean(member.is_owner),
          joinedAt: member.joined_at,
        };
      })
      .sort((left, right) => {
        if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;
        return left.displayName.localeCompare(right.displayName);
      });
  },

  async listCommunityBans(communityId) {
    const { data, error } = await havenCommunitySb().rpc(
      "list_community_bans",
      {
        p_community_id: communityId,
      },
    );
    if (error) throw error;

    return ((data ?? []) as ListCommunityBansRpcRow[]).flatMap((row) => {
      const id = asOptionalString(row.id);
      const returnedCommunityId = asOptionalString(row.community_id);
      const bannedUserId = asOptionalString(row.banned_user_id);
      const bannedAt = asOptionalString(row.banned_at);

      if (!id || !returnedCommunityId || !bannedUserId || !bannedAt) {
        return [];
      }

      return [
        {
          id,
          communityId: returnedCommunityId,
          bannedUserId,
          bannedByUserId: asOptionalString(row.banned_by_user_id),
          reason: asOptionalString(row.reason) ?? "",
          bannedAt,
          revokedAt: asOptionalString(row.revoked_at),
          revokedByUserId: asOptionalString(row.revoked_by_user_id),
          revokedReason: asOptionalString(row.revoked_reason),
          username:
            asOptionalString(row.username) ?? bannedUserId.substring(0, 12),
          avatarUrl: asOptionalString(row.avatar_url),
        } satisfies CommunityBanItem,
      ];
    });
  },

  async banCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error("Ban reason is required.");
    }

    const { data, error } = await havenCommunitySb().rpc(
      "ban_community_member",
      {
        p_community_id: communityId,
        p_target_user_id: targetUserId,
        p_reason: normalizedReason,
      },
    );
    if (error) throw error;

    const row = (
      Array.isArray(data) ? data[0] : data
    ) as BanCommunityMemberRpcRow | null;
    const bannedUserId =
      row && typeof row.banned_user_id === "string" ? row.banned_user_id : null;
    const returnedCommunityId =
      row && typeof row.community_id === "string" ? row.community_id : null;

    if (!bannedUserId || !returnedCommunityId) {
      throw new Error("Ban RPC returned incomplete moderation context.");
    }

    return {
      bannedUserId,
      communityId: returnedCommunityId,
    };
  },

  async kickCommunityMember({ communityId, targetUserId }) {
    const { data, error } = await havenCommunitySb().rpc(
      "kick_community_member",
      {
        p_community_id: communityId,
        p_target_user_id: targetUserId,
      },
    );
    if (error) throw error;

    const row = (
      Array.isArray(data) ? data[0] : data
    ) as KickCommunityMemberRpcRow | null;
    const kickedUserId =
      row && typeof row.kicked_user_id === "string" ? row.kicked_user_id : null;
    const returnedCommunityId =
      row && typeof row.community_id === "string" ? row.community_id : null;

    if (!kickedUserId || !returnedCommunityId) {
      throw new Error("Kick RPC returned incomplete moderation context.");
    }

    return {
      kickedUserId,
      communityId: returnedCommunityId,
    };
  },

  async unbanCommunityMember({ communityId, targetUserId, reason }) {
    const normalizedReason = reason?.trim() ?? null;
    const { error } = await havenCommunitySb().rpc("unban_community_member", {
      p_community_id: communityId,
      p_target_user_id: targetUserId,
      p_reason:
        normalizedReason && normalizedReason.length > 0
          ? normalizedReason
          : undefined,
    });
    if (error) throw error;
  },

  async fetchMyMemberRoleAssignmentForRealtime(communityId, userId) {
    const { data: memberRow, error: memberErr } = await havenCommunitySb()
      .from("community_members")
      .select("id")
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!memberRow?.id) return null;

    const { data: roleRows, error: roleErr } = await havenCommunitySb()
      .from("member_roles")
      .select("role_id")
      .eq("member_id", memberRow.id)
      .eq("community_id", communityId);
    if (roleErr) throw roleErr;

    const roleIds = [...new Set((roleRows ?? []).map((r) => r.role_id))];
    return { memberId: memberRow.id, roleIds };
  },

  async isElevatedInServer(communityId) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id || !communityId) return false;

    const { data: memberRow, error: memberError } = await havenCommunitySb()
      .from("community_members")
      .select("id, is_owner")
      .eq("community_id", communityId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!memberRow) return false;
    if (memberRow.is_owner) return true;

    const { data: memberRoleRows, error: memberRoleError } =
      await havenCommunitySb()
        .from("member_roles")
        .select("role_id")
        .eq("community_id", communityId)
        .eq("member_id", memberRow.id);
    if (memberRoleError) throw memberRoleError;

    const roleIds = Array.from(
      new Set(
        (memberRoleRows ?? [])
          .map((row) => row.role_id)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );
    if (roleIds.length === 0) return false;

    const { data: roleRows, error: roleError } = await havenCommunitySb()
      .from("roles")
      .select("name, is_system")
      .eq("community_id", communityId)
      .in("id", roleIds);
    if (roleError) throw roleError;

    return (roleRows ?? []).some(
      (role) =>
        role.is_system === true &&
        (role.name === "Admin" || role.name === "Moderator"),
    );
  },

  async canSendInChannel(channelId) {
    const { data, error } = await havenCommunitySb().rpc(
      "can_send_in_channel",
      {
        p_channel_id: channelId,
      },
    );

    if (error) throw error;
    return Boolean(data);
  },
};
