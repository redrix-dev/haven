/**
 * Community settings: the overview settings, server roles, role permissions
 * and member role assignment.
 */
import { havenCommunitySb } from "./runtime";
import type { CommunityMemberWithProfile } from "./rows";
import type {
  PermissionCatalogItem,
  ServerMemberRoleItem,
  ServerRoleItem,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
} from "../types";

export interface CommunitySettingsBackend {
  fetchServerSettings(communityId: string): Promise<ServerSettingsSnapshot>;
  updateServerSettings(input: {
    communityId: string;
    values: ServerSettingsUpdate;
  }): Promise<void>;
  fetchServerRoleManagement(
    communityId: string,
  ): Promise<ServerRoleManagementSnapshot>;
  createServerRole(input: {
    communityId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  updateServerRole(input: {
    communityId: string;
    roleId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  deleteServerRole(input: {
    communityId: string;
    roleId: string;
  }): Promise<void>;
  saveServerRolePermissions(input: {
    roleId: string;
    permissionKeys: string[];
  }): Promise<void>;
  saveServerMemberRoles(input: {
    communityId: string;
    memberId: string;
    roleIds: string[];
    assignedByUserId: string;
  }): Promise<void>;
}

export const communitySettingsBackend: CommunitySettingsBackend = {
  async fetchServerSettings(communityId) {
    const [
      { data: community, error: communityError },
      { data: communitySettings, error: communitySettingsError },
    ] = await Promise.all([
      havenCommunitySb()
        .from("communities")
        .select("name, description")
        .eq("id", communityId)
        .maybeSingle(),
      havenCommunitySb()
        .from("community_settings")
        .select("allow_public_invites, require_report_reason")
        .eq("community_id", communityId)
        .maybeSingle(),
    ]);

    if (communityError) throw communityError;
    if (communitySettingsError) throw communitySettingsError;

    return {
      name: community?.name ?? "",
      description: community?.description ?? null,
      allowPublicInvites: communitySettings?.allow_public_invites ?? false,
      requireReportReason: communitySettings?.require_report_reason ?? true,
    };
  },

  async updateServerSettings({ communityId, values }) {
    const { error: communityError } = await havenCommunitySb()
      .from("communities")
      .update({
        name: values.name.trim(),
        description: values.description?.trim()
          ? values.description.trim()
          : null,
      })
      .eq("id", communityId);
    if (communityError) throw communityError;

    const { error: communitySettingsError } = await havenCommunitySb()
      .from("community_settings")
      .update({
        allow_public_invites: values.allowPublicInvites,
        require_report_reason: values.requireReportReason,
      })
      .eq("community_id", communityId);
    if (communitySettingsError) throw communitySettingsError;
  },

  async fetchServerRoleManagement(communityId) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: memberRoles, error: memberRolesError },
      { data: permissionsCatalog, error: permissionsCatalogError },
    ] = await Promise.all([
      havenCommunitySb()
        .from("roles")
        .select("id, name, color, position, is_default, is_system")
        .eq("community_id", communityId)
        .order("position", { ascending: false }),
      havenCommunitySb()
        .from("community_members")
        .select(
          "id, user_id, nickname, is_owner, profiles(username, avatar_url)",
        )
        .eq("community_id", communityId),
      havenCommunitySb()
        .from("member_roles")
        .select("member_id, role_id")
        .eq("community_id", communityId),
      havenCommunitySb()
        .from("permissions_catalog")
        .select("key, description")
        .order("key", { ascending: true }),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (memberRolesError) throw memberRolesError;
    if (permissionsCatalogError) throw permissionsCatalogError;

    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissions: Array<{ role_id: string; permission_key: string }> =
      [];

    if (roleIds.length > 0) {
      const { data: rolePermissionRows, error: rolePermissionsError } =
        await havenCommunitySb()
          .from("role_permissions")
          .select("role_id, permission_key")
          .in("role_id", roleIds);

      if (rolePermissionsError) throw rolePermissionsError;
      rolePermissions = rolePermissionRows ?? [];
    }

    const rolePermissionsByRoleId = new Map<string, Set<string>>();
    for (const rolePermission of rolePermissions) {
      const current =
        rolePermissionsByRoleId.get(rolePermission.role_id) ??
        new Set<string>();
      current.add(rolePermission.permission_key);
      rolePermissionsByRoleId.set(rolePermission.role_id, current);
    }

    const memberRoleIdsByMemberId = new Map<string, string[]>();
    const memberCountByRoleId = new Map<string, number>();
    for (const memberRole of memberRoles ?? []) {
      const currentRoles =
        memberRoleIdsByMemberId.get(memberRole.member_id) ?? [];
      currentRoles.push(memberRole.role_id);
      memberRoleIdsByMemberId.set(memberRole.member_id, currentRoles);
      memberCountByRoleId.set(
        memberRole.role_id,
        (memberCountByRoleId.get(memberRole.role_id) ?? 0) + 1,
      );
    }

    const roleRows: ServerRoleItem[] = (roles ?? [])
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        isDefault: role.is_default,
        isSystem: role.is_system,
        permissionKeys: Array.from(
          rolePermissionsByRoleId.get(role.id) ?? [],
        ).sort(),
        memberCount: memberCountByRoleId.get(role.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.position !== b.position) return b.position - a.position;
        return a.name.localeCompare(b.name);
      });

    const rolePositionByRoleId = new Map(
      roleRows.map((role) => [role.id, role.position]),
    );

    const memberRows: ServerMemberRoleItem[] = (
      (members ?? []) as CommunityMemberWithProfile[]
    )
      .map((member) => {
        const profile = Array.isArray(member.profiles)
          ? member.profiles[0]
          : member.profiles;
        const displayName =
          member.nickname?.trim() ||
          profile?.username ||
          member.user_id.substring(0, 12);
        const roleIds = (memberRoleIdsByMemberId.get(member.id) ?? [])
          .slice()
          .sort(
            (leftRoleId, rightRoleId) =>
              (rolePositionByRoleId.get(rightRoleId) ??
                Number.NEGATIVE_INFINITY) -
              (rolePositionByRoleId.get(leftRoleId) ??
                Number.NEGATIVE_INFINITY),
          );

        return {
          memberId: member.id,
          userId: member.user_id,
          displayName,
          avatarUrl: profile?.avatar_url ?? null,
          isOwner: Boolean(member.is_owner),
          roleIds,
        };
      })
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    const permissionRows: PermissionCatalogItem[] = (
      permissionsCatalog ?? []
    ).map((permission) => ({
      key: permission.key,
      description: permission.description,
    }));

    return {
      roles: roleRows,
      members: memberRows,
      permissionsCatalog: permissionRows,
    };
  },

  async createServerRole({ communityId, name, color, position }) {
    const { error } = await havenCommunitySb().from("roles").insert({
      community_id: communityId,
      name,
      color,
      position,
    });

    if (error) throw error;
  },

  async updateServerRole({ communityId, roleId, name, color, position }) {
    const { error } = await havenCommunitySb()
      .from("roles")
      .update({
        name,
        color,
        position,
      })
      .eq("community_id", communityId)
      .eq("id", roleId);

    if (error) throw error;
  },

  async deleteServerRole({ communityId, roleId }) {
    const { error } = await havenCommunitySb()
      .from("roles")
      .delete()
      .eq("community_id", communityId)
      .eq("id", roleId);

    if (error) throw error;
  },

  async saveServerRolePermissions({ roleId, permissionKeys }) {
    const uniquePermissionKeys = Array.from(new Set(permissionKeys));

    const { error: deleteError } = await havenCommunitySb()
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId);
    if (deleteError) throw deleteError;

    if (uniquePermissionKeys.length === 0) return;

    const rowsToInsert = uniquePermissionKeys.map((permissionKey) => ({
      role_id: roleId,
      permission_key: permissionKey,
    }));

    const { error: insertError } = await havenCommunitySb()
      .from("role_permissions")
      .insert(rowsToInsert);
    if (insertError) throw insertError;
  },

  async saveServerMemberRoles({
    communityId,
    memberId,
    roleIds,
    assignedByUserId,
  }) {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    const { data: existingRows, error: existingRowsError } =
      await havenCommunitySb()
        .from("member_roles")
        .select("role_id")
        .eq("community_id", communityId)
        .eq("member_id", memberId);
    if (existingRowsError) throw existingRowsError;

    const existingRoleIds = (existingRows ?? []).map((row) => row.role_id);
    const existingRoleIdSet = new Set(existingRoleIds);
    const desiredRoleIdSet = new Set(uniqueRoleIds);

    const roleIdsToDelete = existingRoleIds.filter(
      (roleId) => !desiredRoleIdSet.has(roleId),
    );
    const roleIdsToInsert = uniqueRoleIds.filter(
      (roleId) => !existingRoleIdSet.has(roleId),
    );

    if (roleIdsToDelete.length > 0) {
      const { error: deleteError } = await havenCommunitySb()
        .from("member_roles")
        .delete()
        .eq("community_id", communityId)
        .eq("member_id", memberId)
        .in("role_id", roleIdsToDelete);
      if (deleteError) throw deleteError;
    }

    if (roleIdsToInsert.length > 0) {
      const rowsToInsert = roleIdsToInsert.map((roleId) => ({
        community_id: communityId,
        member_id: memberId,
        role_id: roleId,
        assigned_by_user_id: assignedByUserId,
      }));

      const { error: insertError } = await havenCommunitySb()
        .from("member_roles")
        .insert(rowsToInsert);
      if (insertError) throw insertError;
    }
  },
};
