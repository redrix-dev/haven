/**
 * Communities: the community itself, members, roles and permissions, invites,
 * bans, categories and the audit log. DATABASE.md: "Communities".
 *
 * Everything a member may see is readable straight from its table (RLS keeps
 * it to the caller's communities). Whether the caller may *do* something is
 * one question to the database, `getMyPermissions`, never worked out here.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rows, rpc, rpcRows } from "./client";
import { HavenError } from "./havenError";
import type {
  AuditLogEntry,
  ChannelCategory,
  Community,
  CommunityBan,
  CommunityMember,
  Invite,
  MemberRole,
  Permission,
  Role,
  RolePermission,
} from "./records";

/** What a member needs to show one community: who is in it and how it is arranged. */
export type CommunityStructure = {
  community: Community;
  members: CommunityMember[];
  roles: Role[];
  role_permissions: RolePermission[];
  member_roles: MemberRole[];
  categories: ChannelCategory[];
  collapsed_category_ids: string[];
};

export type CommunityChanges = {
  name?: string;
  description?: string;
  invites_enabled?: boolean;
  report_reason_required?: boolean;
};

export type RoleChanges = { name?: string; color?: string; position?: number };

export function createCommunitiesBackend(client: HavenSupabaseClient) {
  return {
    /** The communities the caller belongs to. */
    async listMyCommunities(): Promise<Community[]> {
      return rows(
        await client.from("communities").select("*").order("created_at"),
      );
    },

    /**
     * One community's members, roles and categories. Channels are separate
     * (channels.ts): which ones the caller sees depends on them, not on the
     * community.
     */
    async loadCommunity(communityId: string): Promise<CommunityStructure> {
      const [
        community,
        members,
        roles,
        rolePermissions,
        memberRoles,
        categories,
        collapsed,
      ] = await Promise.all([
        client.from("communities").select("*").eq("id", communityId),
        client
          .from("community_members")
          .select("*")
          .eq("community_id", communityId)
          .order("joined_at"),
        client
          .from("roles")
          .select("*")
          .eq("community_id", communityId)
          .order("position", { ascending: false }),
        client
          .from("role_permissions")
          .select("*")
          .eq("community_id", communityId),
        client.from("member_roles").select("*").eq("community_id", communityId),
        client
          .from("channel_categories")
          .select("*")
          .eq("community_id", communityId)
          .order("position"),
        client.from("collapsed_categories").select("category_id"),
      ]);
      const [found] = rows(community);
      if (!found) {
        // RLS hides a community the caller is not in; say so plainly.
        throw new HavenError(
          "not_found",
          "community_not_found",
          "That community could not be found.",
        );
      }
      const categoryRows = rows(categories);
      const inThisCommunity = new Set(categoryRows.map((c) => c.id));
      return {
        community: found,
        members: rows(members),
        roles: rows(roles),
        role_permissions: rows(rolePermissions),
        member_roles: rows(memberRoles),
        categories: categoryRows,
        collapsed_category_ids: rows(collapsed)
          .map((row) => row.category_id)
          .filter((id) => inThisCommunity.has(id)),
      };
    },

    /** What the caller may do here. The owner gets every permission. */
    async getMyPermissions(communityId: string): Promise<Permission[]> {
      return rpcRows<Permission>(client, "get_my_permissions", {
        p_community_id: communityId,
      });
    },

    async createCommunity(
      name: string,
      description?: string,
    ): Promise<Community> {
      return (await rpc(client, "create_community", {
        p_name: name,
        p_description: description,
      })) as Community;
    },

    async updateCommunity(
      communityId: string,
      changes: CommunityChanges,
    ): Promise<Community> {
      return (await rpc(client, "update_community", {
        p_community_id: communityId,
        p_name: changes.name,
        p_description: changes.description,
        p_invites_enabled: changes.invites_enabled,
        p_report_reason_required: changes.report_reason_required,
      })) as Community;
    },

    async deleteCommunity(communityId: string): Promise<void> {
      await rpc(client, "delete_community", { p_community_id: communityId });
    },

    async transferOwnership(
      communityId: string,
      userId: string,
    ): Promise<Community> {
      return (await rpc(client, "transfer_ownership", {
        p_community_id: communityId,
        p_user_id: userId,
      })) as Community;
    },

    // ── Membership ──────────────────────────────────────────────────────────
    /** Joins with an invite code and returns the community joined. */
    async joinCommunity(code: string): Promise<Community> {
      return (await rpc(client, "join_community", {
        p_code: code,
      })) as Community;
    },

    async leaveCommunity(communityId: string): Promise<void> {
      await rpc(client, "leave_community", { p_community_id: communityId });
    },

    async kickMember(communityId: string, userId: string): Promise<void> {
      await rpc(client, "kick_member", {
        p_community_id: communityId,
        p_user_id: userId,
      });
    },

    async banMember(
      communityId: string,
      userId: string,
      reason: string,
    ): Promise<void> {
      await rpc(client, "ban_member", {
        p_community_id: communityId,
        p_user_id: userId,
        p_reason: reason,
      });
    },

    async unbanMember(communityId: string, userId: string): Promise<void> {
      await rpc(client, "unban_member", {
        p_community_id: communityId,
        p_user_id: userId,
      });
    },

    /** Needs `manage_bans`; returns nothing (not an error) without it. */
    async listBans(communityId: string): Promise<CommunityBan[]> {
      return rows(
        await client
          .from("community_bans")
          .select("*")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false }),
      );
    },

    /** Null clears the nickname. The caller's own, or with `manage_members`. */
    async setNickname(
      communityId: string,
      userId: string,
      nickname: string | null,
    ): Promise<CommunityMember> {
      return (await rpc(client, "set_nickname", {
        p_community_id: communityId,
        p_user_id: userId,
        p_nickname: nickname,
      })) as CommunityMember;
    },

    // ── Roles ───────────────────────────────────────────────────────────────
    async createRole(
      communityId: string,
      name: string,
      options: { color?: string; position?: number } = {},
    ): Promise<Role> {
      return (await rpc(client, "create_role", {
        p_community_id: communityId,
        p_name: name,
        p_color: options.color,
        p_position: options.position,
      })) as Role;
    },

    async updateRole(roleId: string, changes: RoleChanges): Promise<Role> {
      return (await rpc(client, "update_role", {
        p_role_id: roleId,
        p_name: changes.name,
        p_color: changes.color,
        p_position: changes.position,
      })) as Role;
    },

    async deleteRole(roleId: string): Promise<void> {
      await rpc(client, "delete_role", { p_role_id: roleId });
    },

    /** Replaces the role's permissions with exactly these. */
    async setRolePermissions(
      roleId: string,
      permissions: Permission[],
    ): Promise<void> {
      await rpc(client, "set_role_permissions", {
        p_role_id: roleId,
        p_permissions: permissions,
      });
    },

    /** Replaces the member's roles with exactly these. */
    async setMemberRoles(
      communityId: string,
      userId: string,
      roleIds: string[],
    ): Promise<void> {
      await rpc(client, "set_member_roles", {
        p_community_id: communityId,
        p_user_id: userId,
        p_role_ids: roleIds,
      });
    },

    // ── Invites ─────────────────────────────────────────────────────────────
    /** Needs `manage_invites`; returns nothing (not an error) without it. */
    async listInvites(communityId: string): Promise<Invite[]> {
      return rows(
        await client
          .from("invites")
          .select("*")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false }),
      );
    },

    async createInvite(
      communityId: string,
      options: {
        max_uses?: number | null;
        expires_in_hours?: number | null;
      } = {},
    ): Promise<Invite> {
      return (await rpc(client, "create_invite", {
        p_community_id: communityId,
        p_max_uses: options.max_uses,
        p_expires_in_hours: options.expires_in_hours,
      })) as Invite;
    },

    async revokeInvite(inviteId: string): Promise<void> {
      await rpc(client, "revoke_invite", { p_invite_id: inviteId });
    },

    // ── Categories ──────────────────────────────────────────────────────────
    /** Creates a category, or renames and moves one when `category_id` is given. */
    async saveCategory(
      communityId: string,
      name: string,
      options: { position?: number; category_id?: string } = {},
    ): Promise<ChannelCategory> {
      return (await rpc(client, "save_category", {
        p_community_id: communityId,
        p_name: name,
        p_position: options.position,
        p_category_id: options.category_id,
      })) as ChannelCategory;
    },

    async deleteCategory(categoryId: string): Promise<void> {
      await rpc(client, "delete_category", { p_category_id: categoryId });
    },

    /** Only for the caller: how their own sidebar looks. */
    async setCategoryCollapsed(
      categoryId: string,
      collapsed: boolean,
    ): Promise<void> {
      await rpc(client, "set_category_collapsed", {
        p_category_id: categoryId,
        p_collapsed: collapsed,
      });
    },

    // ── Audit log ───────────────────────────────────────────────────────────
    /** Newest first. Needs `view_audit_log`; returns nothing without it. */
    async listAuditLog(
      communityId: string,
      options: { before_id?: string; limit?: number } = {},
    ): Promise<AuditLogEntry[]> {
      let query = client
        .from("community_audit_log")
        .select("*")
        .eq("community_id", communityId)
        .order("id", { ascending: false })
        .limit(Math.min(options.limit ?? 50, 200));
      if (options.before_id) query = query.lt("id", options.before_id);
      return rows(await query);
    },
  };
}

export type CommunitiesBackend = ReturnType<typeof createCommunitiesBackend>;
