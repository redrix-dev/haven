/**
 * Channels and channel groups: listing, CRUD, grouping, and per-channel
 * permission overwrites (fetchChannelPermissions assembles the editor's
 * snapshot from several queries).
 */
import { havenCommunitySb } from "./runtime";
import type { CommunityMemberWithProfile } from "./rows";
import type {
  Channel,
  ChannelCreateInput,
  ChannelGroup,
  ChannelGroupState,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
  ChannelRolePermissionItem,
  ChannelAccessRevokedResult,
} from "../types";

export interface CommunityChannelBackend {
  listChannels(communityId: string): Promise<Channel[]>;
  listChannelGroups(input: {
    communityId: string;
    channelIds: string[];
  }): Promise<ChannelGroupState>;
  createChannelGroup(input: {
    communityId: string;
    name: string;
    position: number;
    createdByUserId: string;
  }): Promise<ChannelGroup>;
  renameChannelGroup(input: {
    communityId: string;
    groupId: string;
    name: string;
  }): Promise<void>;
  deleteChannelGroup(input: {
    communityId: string;
    groupId: string;
  }): Promise<void>;
  setChannelGroupForChannel(input: {
    communityId: string;
    channelId: string;
    groupId: string | null;
    position: number;
  }): Promise<void>;
  setChannelGroupCollapsed(input: {
    communityId: string;
    groupId: string;
    isCollapsed: boolean;
  }): Promise<void>;
  createChannel(input: ChannelCreateInput): Promise<Channel>;
  fetchChannelPermissions(input: {
    communityId: string;
    channelId: string;
    userId: string;
  }): Promise<ChannelPermissionsSnapshot>;
  saveRoleChannelPermissions(input: {
    communityId: string;
    channelId: string;
    roleId: string;
    permissions: ChannelPermissionState;
  }): Promise<void>;
  saveMemberChannelPermissions(input: {
    communityId: string;
    channelId: string;
    memberId: string;
    permissions: ChannelPermissionState;
  }): Promise<ChannelAccessRevokedResult | null>;
  listChannelRevokedUserIds(input: {
    communityId: string;
    channelId: string;
  }): Promise<string[]>;
  updateChannel(input: {
    communityId: string;
    channelId: string;
    name: string;
    topic: string | null;
  }): Promise<void>;
  deleteChannel(input: {
    communityId: string;
    channelId: string;
  }): Promise<void>;
}

export const communityChannelBackend: CommunityChannelBackend = {
  async listChannels(communityId) {
    const { data, error } = await havenCommunitySb()
      .from("channels")
      .select("*")
      .eq("community_id", communityId)
      .order("position", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async listChannelGroups({ communityId, channelIds }) {
    const [
      { data: groupRows, error: groupRowsError },
      { data: mappingRows, error: mappingRowsError },
      authResult,
    ] = await Promise.all([
      havenCommunitySb()
        .from("channel_groups")
        .select("id, community_id, name, position")
        .eq("community_id", communityId)
        .order("position", { ascending: true }),
      havenCommunitySb()
        .from("channel_group_channels")
        .select("channel_id, group_id, position")
        .eq("community_id", communityId)
        .order("position", { ascending: true }),
      havenCommunitySb().auth.getUser(),
    ]);

    if (groupRowsError) throw groupRowsError;
    if (mappingRowsError) throw mappingRowsError;
    if (authResult.error) throw authResult.error;

    const currentUserId = authResult.data.user?.id ?? null;

    let collapsedGroupIds: string[] = [];
    if (currentUserId) {
      const { data: preferenceRows, error: preferenceRowsError } =
        await havenCommunitySb()
          .from("channel_group_preferences")
          .select("group_id, is_collapsed")
          .eq("community_id", communityId)
          .eq("user_id", currentUserId)
          .eq("is_collapsed", true);
      if (preferenceRowsError) throw preferenceRowsError;
      collapsedGroupIds = (preferenceRows ?? []).map((row) => row.group_id);
    }

    const channelIdsByGroupId = new Map<string, string[]>();
    for (const mappingRow of mappingRows ?? []) {
      const existing = channelIdsByGroupId.get(mappingRow.group_id) ?? [];
      existing.push(mappingRow.channel_id);
      channelIdsByGroupId.set(mappingRow.group_id, existing);
    }

    const groups: ChannelGroup[] = (groupRows ?? []).map((groupRow) => ({
      id: groupRow.id,
      communityId: groupRow.community_id,
      name: groupRow.name,
      position: groupRow.position,
      channelIds: channelIdsByGroupId.get(groupRow.id) ?? [],
    }));

    const groupedChannelIds = new Set(
      Array.from(channelIdsByGroupId.values()).flat(),
    );

    return {
      groups,
      ungroupedChannelIds: channelIds.filter(
        (channelId) => !groupedChannelIds.has(channelId),
      ),
      collapsedGroupIds,
    };
  },

  async createChannelGroup({ communityId, name, position, createdByUserId }) {
    const { data, error } = await havenCommunitySb()
      .from("channel_groups")
      .insert({
        community_id: communityId,
        name,
        position,
        created_by_user_id: createdByUserId,
      })
      .select("id, community_id, name, position")
      .single();

    if (error) throw error;

    return {
      id: data.id,
      communityId: data.community_id,
      name: data.name,
      position: data.position,
      channelIds: [],
    };
  },

  async renameChannelGroup({ communityId, groupId, name }) {
    const { error } = await havenCommunitySb()
      .from("channel_groups")
      .update({ name })
      .eq("community_id", communityId)
      .eq("id", groupId);
    if (error) throw error;
  },

  async deleteChannelGroup({ communityId, groupId }) {
    const { error } = await havenCommunitySb()
      .from("channel_groups")
      .delete()
      .eq("community_id", communityId)
      .eq("id", groupId);
    if (error) throw error;
  },

  async setChannelGroupForChannel({
    communityId,
    channelId,
    groupId,
    position,
  }) {
    if (!groupId) {
      const { error } = await havenCommunitySb()
        .from("channel_group_channels")
        .delete()
        .eq("community_id", communityId)
        .eq("channel_id", channelId);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb()
      .from("channel_group_channels")
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          group_id: groupId,
          position,
        },
        { onConflict: "community_id,channel_id" },
      );
    if (error) throw error;
  },

  async setChannelGroupCollapsed({ communityId, groupId, isCollapsed }) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error("Not authenticated.");

    if (!isCollapsed) {
      const { error } = await havenCommunitySb()
        .from("channel_group_preferences")
        .delete()
        .eq("community_id", communityId)
        .eq("group_id", groupId)
        .eq("user_id", user.id);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb()
      .from("channel_group_preferences")
      .upsert(
        {
          community_id: communityId,
          group_id: groupId,
          user_id: user.id,
          is_collapsed: true,
        },
        { onConflict: "community_id,group_id,user_id" },
      );
    if (error) throw error;
  },

  async createChannel(input) {
    const {
      data: { user },
      error: authError,
    } = await havenCommunitySb().auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error("Not authenticated.");

    const insertPayload = {
      community_id: input.communityId,
      name: input.name,
      topic: input.topic,
      created_by_user_id: user.id,
      position: input.position,
      kind: input.kind,
    };

    const { error } = await havenCommunitySb()
      .from("channels")
      .insert(insertPayload);

    if (error) {
      console.error("[createChannel] insert failed", {
        authUserId: user.id,
        communityId: input.communityId,
        channelName: input.name,
        channelKind: input.kind,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    const { data: fallbackChannel, error: fallbackError } =
      await havenCommunitySb()
        .from("channels")
        .select("*")
        .eq("community_id", input.communityId)
        .eq("name", input.name)
        .maybeSingle();

    if (fallbackError) throw fallbackError;
    if (!fallbackChannel) {
      throw new Error(
        "Channel was created but is not visible to the current user.",
      );
    }

    return fallbackChannel;
  },

  async fetchChannelPermissions({ communityId, channelId, userId }) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: roleOverwrites, error: roleOverwritesError },
      { data: memberOverwrites, error: memberOverwritesError },
      { data: myMember, error: myMemberError },
    ] = await Promise.all([
      havenCommunitySb()
        .from("roles")
        .select("id, name, color, is_default, position")
        .eq("community_id", communityId)
        .order("position", { ascending: false }),
      havenCommunitySb()
        .from("community_members")
        .select("id, nickname, is_owner, user_id, profiles(username)")
        .eq("community_id", communityId),
      havenCommunitySb()
        .from("channel_role_overwrites")
        .select("role_id, can_view, can_send, can_manage")
        .eq("community_id", communityId)
        .eq("channel_id", channelId),
      havenCommunitySb()
        .from("channel_member_overwrites")
        .select("member_id, can_view, can_send, can_manage")
        .eq("community_id", communityId)
        .eq("channel_id", channelId),
      havenCommunitySb()
        .from("community_members")
        .select("id, is_owner")
        .eq("community_id", communityId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (roleOverwritesError) throw roleOverwritesError;
    if (memberOverwritesError) throw memberOverwritesError;
    if (myMemberError) throw myMemberError;

    const allMemberOptions: ChannelMemberOption[] = (
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

        return {
          memberId: member.id,
          displayName,
          isOwner: Boolean(member.is_owner),
        };
      })
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    const roleOverwriteMap = new Map(
      (roleOverwrites ?? []).map((overwrite) => [
        overwrite.role_id,
        {
          canView: overwrite.can_view,
          canSend: overwrite.can_send,
          canManage: overwrite.can_manage,
        },
      ]),
    );

    const rolePositionById = new Map(
      (roles ?? []).map((role) => [role.id, role.position]),
    );
    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissionRows: Array<{ role_id: string; permission_key: string }> =
      [];

    if (roleIds.length > 0) {
      const { data: rolePermissionData, error: rolePermissionsError } =
        await havenCommunitySb()
          .from("role_permissions")
          .select("role_id, permission_key")
          .in("role_id", roleIds);

      if (rolePermissionsError) throw rolePermissionsError;
      rolePermissionRows = rolePermissionData ?? [];
    }

    const rolePermissionKeysByRoleId = new Map<string, Set<string>>();
    for (const row of rolePermissionRows) {
      const current =
        rolePermissionKeysByRoleId.get(row.role_id) ?? new Set<string>();
      current.add(row.permission_key);
      rolePermissionKeysByRoleId.set(row.role_id, current);
    }

    let canEditAllRoles = Boolean(myMember?.is_owner);
    let myHighestRolePosition = Number.NEGATIVE_INFINITY;

    if (!canEditAllRoles && myMember?.id) {
      const { data: myAssignedRoles, error: myAssignedRolesError } =
        await havenCommunitySb()
          .from("member_roles")
          .select("role_id")
          .eq("community_id", communityId)
          .eq("member_id", myMember.id);

      if (myAssignedRolesError) throw myAssignedRolesError;

      myHighestRolePosition = (myAssignedRoles ?? []).reduce(
        (highest, roleAssignment) => {
          const rolePosition = rolePositionById.get(roleAssignment.role_id);
          if (typeof rolePosition !== "number") return highest;
          return Math.max(highest, rolePosition);
        },
        Number.NEGATIVE_INFINITY,
      );
    }

    const roleRows: ChannelRolePermissionItem[] = (roles ?? []).map((role) => {
      const overwrite = roleOverwriteMap.get(role.id);
      const rolePermissionKeys =
        rolePermissionKeysByRoleId.get(role.id) ?? new Set<string>();
      return {
        roleId: role.id,
        name: role.name,
        color: role.color,
        isDefault: role.is_default,
        editable: canEditAllRoles || role.position < myHighestRolePosition,
        defaultCanView: rolePermissionKeys.has("view_channels"),
        defaultCanSend: rolePermissionKeys.has("send_messages"),
        defaultCanManage: rolePermissionKeys.has("manage_channels"),
        canView: overwrite?.canView ?? null,
        canSend: overwrite?.canSend ?? null,
        canManage: overwrite?.canManage ?? null,
      };
    });

    const memberById = new Map(
      allMemberOptions.map((member) => [member.memberId, member]),
    );

    const memberRows: ChannelMemberPermissionItem[] = (memberOverwrites ?? [])
      .map((overwrite) => {
        const member = memberById.get(overwrite.member_id);
        if (!member) return null;

        return {
          memberId: member.memberId,
          displayName: member.displayName,
          isOwner: member.isOwner,
          canView: overwrite.can_view,
          canSend: overwrite.can_send,
          canManage: overwrite.can_manage,
        };
      })
      .filter(
        (member): member is ChannelMemberPermissionItem => member !== null,
      )
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    return {
      rolePermissions: roleRows,
      memberPermissions: memberRows,
      memberOptions: allMemberOptions,
    };
  },

  async saveRoleChannelPermissions({
    communityId,
    channelId,
    roleId,
    permissions,
  }) {
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await havenCommunitySb()
        .from("channel_role_overwrites")
        .delete()
        .eq("community_id", communityId)
        .eq("channel_id", channelId)
        .eq("role_id", roleId);
      if (error) throw error;
      return;
    }

    const { error } = await havenCommunitySb()
      .from("channel_role_overwrites")
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          role_id: roleId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: "channel_id,role_id" },
      );
    if (error) throw error;
  },

  async saveMemberChannelPermissions({
    communityId,
    channelId,
    memberId,
    permissions,
  }) {
    const [
      { data: memberRow, error: memberError },
      { data: existingOverwrite, error: existingOverwriteError },
    ] = await Promise.all([
      havenCommunitySb()
        .from("community_members")
        .select("user_id")
        .eq("community_id", communityId)
        .eq("id", memberId)
        .maybeSingle(),
      havenCommunitySb()
        .from("channel_member_overwrites")
        .select("can_view")
        .eq("community_id", communityId)
        .eq("channel_id", channelId)
        .eq("member_id", memberId)
        .maybeSingle(),
    ]);
    if (memberError) throw memberError;
    if (existingOverwriteError) throw existingOverwriteError;

    const revokedUserId = memberRow?.user_id ?? null;
    if (!revokedUserId) {
      throw new Error("Channel member overwrite target was not found.");
    }

    const wasExplicitlyRevoked = existingOverwrite?.can_view === false;
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await havenCommunitySb()
        .from("channel_member_overwrites")
        .delete()
        .eq("community_id", communityId)
        .eq("channel_id", channelId)
        .eq("member_id", memberId);
      if (error) throw error;
      return null;
    }

    const { error } = await havenCommunitySb()
      .from("channel_member_overwrites")
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          member_id: memberId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: "channel_id,member_id" },
      );
    if (error) throw error;
    if (permissions.canView !== false || wasExplicitlyRevoked) {
      return null;
    }

    return {
      revokedUserId,
      channelId,
      communityId,
    };
  },

  async listChannelRevokedUserIds({ communityId, channelId }) {
    const { data: overwriteRows, error: overwriteError } =
      await havenCommunitySb()
        .from("channel_member_overwrites")
        .select("member_id")
        .eq("community_id", communityId)
        .eq("channel_id", channelId)
        .eq("can_view", false);
    if (overwriteError) throw overwriteError;

    const memberIds = Array.from(
      new Set(
        (overwriteRows ?? [])
          .map((row) => row.member_id)
          .filter((memberId): memberId is string => Boolean(memberId)),
      ),
    );
    if (memberIds.length === 0) {
      return [] as string[];
    }

    const { data: memberRows, error: memberError } = await havenCommunitySb()
      .from("community_members")
      .select("user_id")
      .eq("community_id", communityId)
      .in("id", memberIds);
    if (memberError) throw memberError;

    return Array.from(
      new Set(
        (memberRows ?? [])
          .map((row) => row.user_id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
  },

  async updateChannel({ communityId, channelId, name, topic }) {
    const { error } = await havenCommunitySb()
      .from("channels")
      .update({
        name,
        topic,
      })
      .eq("community_id", communityId)
      .eq("id", channelId);

    if (error) throw error;
  },

  async deleteChannel({ communityId, channelId }) {
    const { error } = await havenCommunitySb()
      .from("channels")
      .delete()
      .eq("community_id", communityId)
      .eq("id", channelId);

    if (error) throw error;
  },
};
