import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type {
  AuthorProfile,
  Channel,
  ChannelCreateInput,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
  ChannelRolePermissionItem,
  PermissionCatalogItem,
  MessageReportKind,
  MessageReportTarget,
  Message,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
} from './types';

type CommunityMemberWithProfile = Pick<
  Database['public']['Tables']['community_members']['Row'],
  'id' | 'nickname' | 'is_owner' | 'user_id'
> & {
  profiles:
    | Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>
    | Array<Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url'>>
    | null;
};

const getRealtimeRowChannelId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const maybeChannelId = (value as { channel_id?: unknown }).channel_id;
  return typeof maybeChannelId === 'string' ? maybeChannelId : null;
};

// Incident toggle for channel-create debugging.
// Keep disabled by default. Re-enable by setting `HAVEN_DEBUG_CHANNEL_CREATE=1`.
const ENABLE_CHANNEL_CREATE_DIAGNOSTICS = process.env.HAVEN_DEBUG_CHANNEL_CREATE === '1';

export interface CommunityDataBackend {
  fetchServerPermissions(communityId: string): Promise<ServerPermissions>;
  listChannels(communityId: string): Promise<Channel[]>;
  subscribeToChannels(communityId: string, onChange: () => void): RealtimeChannel;
  listMessages(communityId: string, channelId: string): Promise<Message[]>;
  subscribeToMessages(channelId: string, onChange: () => void): RealtimeChannel;
  fetchAuthorProfiles(authorIds: string[]): Promise<Record<string, AuthorProfile>>;
  isHavenDeveloperMessagingAllowed(input: {
    communityId: string;
    channelId: string;
  }): Promise<boolean>;
  canSendInChannel(channelId: string): Promise<boolean>;
  fetchServerSettings(communityId: string): Promise<ServerSettingsSnapshot>;
  updateServerSettings(input: {
    communityId: string;
    userId: string;
    values: ServerSettingsUpdate;
    canManageDeveloperAccess: boolean;
  }): Promise<void>;
  fetchServerRoleManagement(communityId: string): Promise<ServerRoleManagementSnapshot>;
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
  deleteServerRole(input: { communityId: string; roleId: string }): Promise<void>;
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
  }): Promise<void>;
  updateChannel(input: {
    communityId: string;
    channelId: string;
    name: string;
    topic: string | null;
  }): Promise<void>;
  deleteChannel(input: { communityId: string; channelId: string }): Promise<void>;
  sendUserMessage(input: {
    communityId: string;
    channelId: string;
    userId: string;
    content: string;
    replyToMessageId?: string;
  }): Promise<void>;
  editUserMessage(input: {
    communityId: string;
    messageId: string;
    content: string;
  }): Promise<void>;
  deleteMessage(input: {
    communityId: string;
    messageId: string;
  }): Promise<void>;
  reportMessage(input: {
    communityId: string;
    channelId: string;
    messageId: string;
    reporterUserId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }): Promise<void>;
  postHavenDeveloperMessage(input: {
    communityId: string;
    channelId: string;
    content: string;
  }): Promise<void>;
}

export const centralCommunityDataBackend: CommunityDataBackend = {
  async fetchServerPermissions(communityId) {
    const [
      { data: isOwner },
      { data: canManageServer },
      { data: canManageRoles },
      { data: canManageMembers },
      { data: canCreateChannels },
      { data: canManageChannels },
      { data: canManageMessages },
      { data: canManageDeveloperAccess },
      { data: canManageInvites },
    ] = await Promise.all([
      supabase.rpc('is_community_owner', { p_community_id: communityId }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_server',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_roles',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_members',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'create_channels',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_channels',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_messages',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_developer_access',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_invites',
      }),
    ]);

    const owner = Boolean(isOwner);
    const manageChannels = owner || Boolean(canManageChannels);

    return {
      isOwner: owner,
      canManageServer: owner || Boolean(canManageServer),
      canManageRoles: owner || Boolean(canManageRoles),
      canManageMembers: owner || Boolean(canManageMembers),
      canCreateChannels: owner || Boolean(canCreateChannels) || manageChannels,
      canManageChannels: manageChannels,
      canManageMessages: owner || Boolean(canManageMessages),
      canManageDeveloperAccess: owner || Boolean(canManageDeveloperAccess),
      canManageInvites: owner || Boolean(canManageInvites),
    };
  },

  async listChannels(communityId) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('community_id', communityId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  subscribeToChannels(communityId, onChange) {
    return supabase
      .channel(`channels:${communityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channels',
          filter: `community_id=eq.${communityId}`,
        },
        onChange
      )
      .subscribe();
  },

  async listMessages(communityId, channelId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('community_id', communityId)
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  subscribeToMessages(channelId, onChange) {
    return supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // DELETE payloads can omit non-primary-key fields unless replica identity is FULL.
          // Fall back to firing on every delete so UI never lags stale rows.
          const deletedChannelId = getRealtimeRowChannelId(payload.old);
          if (!deletedChannelId || deletedChannelId === channelId) {
            onChange();
          }
        }
      )
      .subscribe();
  },

  async fetchAuthorProfiles(authorIds) {
    if (authorIds.length === 0) return {};

    const [{ data: profiles, error: profilesError }, { data: activeStaffRows, error: staffError }] =
      await Promise.all([
        supabase.from('profiles').select('id, username').in('id', authorIds),
        supabase
          .from('platform_staff')
          .select('user_id, display_prefix')
          .in('user_id', authorIds)
          .eq('is_active', true),
      ]);

    if (profilesError) throw profilesError;
    if (staffError) throw staffError;

    const profileMap: Record<string, AuthorProfile> = {};
    for (const authorId of authorIds) {
      profileMap[authorId] = {
        username: authorId.substring(0, 12),
        isPlatformStaff: false,
        displayPrefix: null,
      };
    }

    for (const profile of profiles ?? []) {
      profileMap[profile.id] = {
        username: profile.username,
        isPlatformStaff: false,
        displayPrefix: null,
      };
    }

    for (const staffRow of activeStaffRows ?? []) {
      const existing = profileMap[staffRow.user_id] ?? {
        username: staffRow.user_id.substring(0, 12),
        isPlatformStaff: false,
        displayPrefix: null,
      };

      profileMap[staffRow.user_id] = {
        ...existing,
        isPlatformStaff: true,
        displayPrefix: staffRow.display_prefix ?? null,
      };
    }

    return profileMap;
  },

  async isHavenDeveloperMessagingAllowed({ communityId, channelId }) {
    const { data: developerAccess, error: developerAccessError } = await supabase
      .from('community_developer_access')
      .select('enabled, mode')
      .eq('community_id', communityId)
      .maybeSingle();

    if (developerAccessError || !developerAccess?.enabled) {
      return false;
    }

    if (developerAccess.mode === 'report_only') {
      return false;
    }

    if (developerAccess.mode === 'channel_scoped') {
      const { data: allowedChannel } = await supabase
        .from('community_developer_access_channels')
        .select('channel_id')
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .maybeSingle();

      return Boolean(allowedChannel);
    }

    return false;
  },

  async canSendInChannel(channelId) {
    const { data, error } = await supabase.rpc('can_send_in_channel', {
      p_channel_id: channelId,
    });

    if (error) throw error;
    return Boolean(data);
  },

  async fetchServerSettings(communityId) {
    const [
      { data: community, error: communityError },
      { data: communitySettings, error: communitySettingsError },
      { data: developerAccess, error: developerAccessError },
      { data: scopedChannels, error: scopedChannelsError },
    ] = await Promise.all([
      supabase
        .from('communities')
        .select('name, description')
        .eq('id', communityId)
        .maybeSingle(),
      supabase
        .from('community_settings')
        .select('allow_public_invites, require_report_reason, allow_haven_developer_access, developer_access_mode')
        .eq('community_id', communityId)
        .maybeSingle(),
      supabase
        .from('community_developer_access')
        .select('enabled, mode')
        .eq('community_id', communityId)
        .maybeSingle(),
      supabase
        .from('community_developer_access_channels')
        .select('channel_id')
        .eq('community_id', communityId),
    ]);

    if (communityError) throw communityError;
    if (communitySettingsError) throw communitySettingsError;
    if (developerAccessError) throw developerAccessError;
    if (scopedChannelsError) throw scopedChannelsError;

    const defaultMode = 'report_only' as const;

    return {
      name: community?.name ?? '',
      description: community?.description ?? null,
      allowPublicInvites: communitySettings?.allow_public_invites ?? false,
      requireReportReason: communitySettings?.require_report_reason ?? true,
      developerAccessEnabled:
        developerAccess?.enabled ?? communitySettings?.allow_haven_developer_access ?? false,
      developerAccessMode:
        developerAccess?.mode ?? communitySettings?.developer_access_mode ?? defaultMode,
      developerAccessChannelIds: (scopedChannels ?? []).map((row) => row.channel_id),
    };
  },

  async updateServerSettings({ communityId, userId, values, canManageDeveloperAccess }) {
    const { error: communityError } = await supabase
      .from('communities')
      .update({
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      })
      .eq('id', communityId);
    if (communityError) throw communityError;

    const { error: communitySettingsError } = await supabase
      .from('community_settings')
      .update({
        allow_public_invites: values.allowPublicInvites,
        require_report_reason: values.requireReportReason,
        allow_haven_developer_access: values.developerAccessEnabled,
        developer_access_mode: values.developerAccessMode,
      })
      .eq('community_id', communityId);
    if (communitySettingsError) throw communitySettingsError;

    if (!canManageDeveloperAccess) return;

    const { error: developerAccessError } = await supabase
      .from('community_developer_access')
      .update({
        enabled: values.developerAccessEnabled,
        mode: values.developerAccessMode,
        granted_by_user_id: userId,
        granted_at: values.developerAccessEnabled ? new Date().toISOString() : null,
      })
      .eq('community_id', communityId);
    if (developerAccessError) throw developerAccessError;

    const { error: clearScopedError } = await supabase
      .from('community_developer_access_channels')
      .delete()
      .eq('community_id', communityId);
    if (clearScopedError) throw clearScopedError;

    if (
      values.developerAccessEnabled &&
      values.developerAccessMode === 'channel_scoped' &&
      values.developerAccessChannelIds.length > 0
    ) {
      const scopedRows = values.developerAccessChannelIds.map((channelId) => ({
        community_id: communityId,
        channel_id: channelId,
      }));

      const { error: scopedInsertError } = await supabase
        .from('community_developer_access_channels')
        .insert(scopedRows);
      if (scopedInsertError) throw scopedInsertError;
    }
  },

  async fetchServerRoleManagement(communityId) {
    const [
      { data: roles, error: rolesError },
      { data: members, error: membersError },
      { data: memberRoles, error: memberRolesError },
      { data: permissionsCatalog, error: permissionsCatalogError },
    ] = await Promise.all([
      supabase
        .from('roles')
        .select('id, name, color, position, is_default, is_system')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),
      supabase
        .from('community_members')
        .select('id, user_id, nickname, is_owner, profiles(username, avatar_url)')
        .eq('community_id', communityId),
      supabase
        .from('member_roles')
        .select('member_id, role_id')
        .eq('community_id', communityId),
      supabase.from('permissions_catalog').select('key, description').order('key', { ascending: true }),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (memberRolesError) throw memberRolesError;
    if (permissionsCatalogError) throw permissionsCatalogError;

    const roleIds = (roles ?? []).map((role) => role.id);
    let rolePermissions: Array<{ role_id: string; permission_key: string }> = [];

    if (roleIds.length > 0) {
      const { data: rolePermissionRows, error: rolePermissionsError } = await supabase
        .from('role_permissions')
        .select('role_id, permission_key')
        .in('role_id', roleIds);

      if (rolePermissionsError) throw rolePermissionsError;
      rolePermissions = rolePermissionRows ?? [];
    }

    const rolePermissionsByRoleId = new Map<string, Set<string>>();
    for (const rolePermission of rolePermissions) {
      const current = rolePermissionsByRoleId.get(rolePermission.role_id) ?? new Set<string>();
      current.add(rolePermission.permission_key);
      rolePermissionsByRoleId.set(rolePermission.role_id, current);
    }

    const memberRoleIdsByMemberId = new Map<string, string[]>();
    const memberCountByRoleId = new Map<string, number>();
    for (const memberRole of memberRoles ?? []) {
      const currentRoles = memberRoleIdsByMemberId.get(memberRole.member_id) ?? [];
      currentRoles.push(memberRole.role_id);
      memberRoleIdsByMemberId.set(memberRole.member_id, currentRoles);
      memberCountByRoleId.set(
        memberRole.role_id,
        (memberCountByRoleId.get(memberRole.role_id) ?? 0) + 1
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
        permissionKeys: Array.from(rolePermissionsByRoleId.get(role.id) ?? []).sort(),
        memberCount: memberCountByRoleId.get(role.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.position !== b.position) return b.position - a.position;
        return a.name.localeCompare(b.name);
      });

    const rolePositionByRoleId = new Map(roleRows.map((role) => [role.id, role.position]));

    const memberRows: ServerMemberRoleItem[] = ((members ?? []) as CommunityMemberWithProfile[])
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const displayName = member.nickname?.trim() || profile?.username || member.user_id.substring(0, 12);
        const roleIds = (memberRoleIdsByMemberId.get(member.id) ?? [])
          .slice()
          .sort(
            (leftRoleId, rightRoleId) =>
              (rolePositionByRoleId.get(rightRoleId) ?? Number.NEGATIVE_INFINITY) -
              (rolePositionByRoleId.get(leftRoleId) ?? Number.NEGATIVE_INFINITY)
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

    const permissionRows: PermissionCatalogItem[] = (permissionsCatalog ?? []).map((permission) => ({
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
    const { error } = await supabase.from('roles').insert({
      community_id: communityId,
      name,
      color,
      position,
    });

    if (error) throw error;
  },

  async updateServerRole({ communityId, roleId, name, color, position }) {
    const { error } = await supabase
      .from('roles')
      .update({
        name,
        color,
        position,
      })
      .eq('community_id', communityId)
      .eq('id', roleId);

    if (error) throw error;
  },

  async deleteServerRole({ communityId, roleId }) {
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('community_id', communityId)
      .eq('id', roleId);

    if (error) throw error;
  },

  async saveServerRolePermissions({ roleId, permissionKeys }) {
    const uniquePermissionKeys = Array.from(new Set(permissionKeys));

    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);
    if (deleteError) throw deleteError;

    if (uniquePermissionKeys.length === 0) return;

    const rowsToInsert = uniquePermissionKeys.map((permissionKey) => ({
      role_id: roleId,
      permission_key: permissionKey,
    }));

    const { error: insertError } = await supabase.from('role_permissions').insert(rowsToInsert);
    if (insertError) throw insertError;
  },

  async saveServerMemberRoles({ communityId, memberId, roleIds, assignedByUserId }) {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('member_roles')
      .select('role_id')
      .eq('community_id', communityId)
      .eq('member_id', memberId);
    if (existingRowsError) throw existingRowsError;

    const existingRoleIds = (existingRows ?? []).map((row) => row.role_id);
    const existingRoleIdSet = new Set(existingRoleIds);
    const desiredRoleIdSet = new Set(uniqueRoleIds);

    const roleIdsToDelete = existingRoleIds.filter((roleId) => !desiredRoleIdSet.has(roleId));
    const roleIdsToInsert = uniqueRoleIds.filter((roleId) => !existingRoleIdSet.has(roleId));

    if (roleIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('member_roles')
        .delete()
        .eq('community_id', communityId)
        .eq('member_id', memberId)
        .in('role_id', roleIdsToDelete);
      if (deleteError) throw deleteError;
    }

    if (roleIdsToInsert.length > 0) {
      const rowsToInsert = roleIdsToInsert.map((roleId) => ({
        community_id: communityId,
        member_id: memberId,
        role_id: roleId,
        assigned_by_user_id: assignedByUserId,
      }));

      const { error: insertError } = await supabase.from('member_roles').insert(rowsToInsert);
      if (insertError) throw insertError;
    }
  },

  async createChannel(input) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    if (ENABLE_CHANNEL_CREATE_DIAGNOSTICS) {
      const [{ data: ownerCheck }, { data: canCreateChannels }, { data: canManageChannels }] =
        await Promise.all([
          supabase.rpc('is_community_owner', {
            p_community_id: input.communityId,
          }),
          supabase.rpc('user_has_permission', {
            p_community_id: input.communityId,
            p_permission_key: 'create_channels',
          }),
          supabase.rpc('user_has_permission', {
            p_community_id: input.communityId,
            p_permission_key: 'manage_channels',
          }),
        ]);

      console.info('[createChannel] diagnostics', {
        authUserId: user.id,
        communityId: input.communityId,
        channelName: input.name,
        channelKind: input.kind,
        channelPosition: input.position,
        isCommunityOwner: Boolean(ownerCheck),
        canCreateChannels: Boolean(canCreateChannels),
        canManageChannels: Boolean(canManageChannels),
      });
    }

    const insertPayload = {
      community_id: input.communityId,
      name: input.name,
      topic: input.topic,
      created_by_user_id: user.id,
      position: input.position,
      kind: input.kind,
    };

    const { error } = await supabase
      .from('channels')
      .insert(insertPayload);

    if (error) {
      if (ENABLE_CHANNEL_CREATE_DIAGNOSTICS) {
        console.error('[createChannel] insert failed', {
          authUserId: user.id,
          communityId: input.communityId,
          channelName: input.name,
          channelKind: input.kind,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
      }
      throw error;
    }
    const { data: fallbackChannel, error: fallbackError } = await supabase
      .from('channels')
      .select('*')
      .eq('community_id', input.communityId)
      .eq('name', input.name)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    if (!fallbackChannel) {
      throw new Error('Channel was created but is not visible to the current user.');
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
      supabase
        .from('roles')
        .select('id, name, color, is_default, position')
        .eq('community_id', communityId)
        .order('position', { ascending: false }),
      supabase
        .from('community_members')
        .select('id, nickname, is_owner, user_id, profiles(username)')
        .eq('community_id', communityId),
      supabase
        .from('channel_role_overwrites')
        .select('role_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),
      supabase
        .from('channel_member_overwrites')
        .select('member_id, can_view, can_send, can_manage')
        .eq('community_id', communityId)
        .eq('channel_id', channelId),
      supabase
        .from('community_members')
        .select('id, is_owner')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (rolesError) throw rolesError;
    if (membersError) throw membersError;
    if (roleOverwritesError) throw roleOverwritesError;
    if (memberOverwritesError) throw memberOverwritesError;
    if (myMemberError) throw myMemberError;

    const allMemberOptions: ChannelMemberOption[] = ((members ?? []) as CommunityMemberWithProfile[])
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const displayName = member.nickname?.trim() || profile?.username || member.user_id.substring(0, 12);

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
      ])
    );

    const rolePositionById = new Map((roles ?? []).map((role) => [role.id, role.position]));

    let canEditAllRoles = Boolean(myMember?.is_owner);
    let myHighestRolePosition = Number.NEGATIVE_INFINITY;

    if (!canEditAllRoles && myMember?.id) {
      const { data: myAssignedRoles, error: myAssignedRolesError } = await supabase
        .from('member_roles')
        .select('role_id')
        .eq('community_id', communityId)
        .eq('member_id', myMember.id);

      if (myAssignedRolesError) throw myAssignedRolesError;

      myHighestRolePosition = (myAssignedRoles ?? []).reduce((highest, roleAssignment) => {
        const rolePosition = rolePositionById.get(roleAssignment.role_id);
        if (typeof rolePosition !== 'number') return highest;
        return Math.max(highest, rolePosition);
      }, Number.NEGATIVE_INFINITY);
    }

    const roleRows: ChannelRolePermissionItem[] = (roles ?? []).map((role) => {
      const overwrite = roleOverwriteMap.get(role.id);
      return {
        roleId: role.id,
        name: role.name,
        color: role.color,
        isDefault: role.is_default,
        editable: canEditAllRoles || role.position < myHighestRolePosition,
        canView: overwrite?.canView ?? null,
        canSend: overwrite?.canSend ?? null,
        canManage: overwrite?.canManage ?? null,
      };
    });

    const memberById = new Map(allMemberOptions.map((member) => [member.memberId, member]));

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
      .filter((member): member is ChannelMemberPermissionItem => member !== null)
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

  async saveRoleChannelPermissions({ communityId, channelId, roleId, permissions }) {
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await supabase
        .from('channel_role_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('role_id', roleId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_role_overwrites')
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          role_id: roleId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: 'channel_id,role_id' }
      );
    if (error) throw error;
  },

  async saveMemberChannelPermissions({ communityId, channelId, memberId, permissions }) {
    const allInherited =
      permissions.canView === null &&
      permissions.canSend === null &&
      permissions.canManage === null;

    if (allInherited) {
      const { error } = await supabase
        .from('channel_member_overwrites')
        .delete()
        .eq('community_id', communityId)
        .eq('channel_id', channelId)
        .eq('member_id', memberId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('channel_member_overwrites')
      .upsert(
        {
          community_id: communityId,
          channel_id: channelId,
          member_id: memberId,
          can_view: permissions.canView,
          can_send: permissions.canSend,
          can_manage: permissions.canManage,
        },
        { onConflict: 'channel_id,member_id' }
      );
    if (error) throw error;
  },

  async updateChannel({ communityId, channelId, name, topic }) {
    const { error } = await supabase
      .from('channels')
      .update({
        name,
        topic,
      })
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async deleteChannel({ communityId, channelId }) {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('community_id', communityId)
      .eq('id', channelId);

    if (error) throw error;
  },

  async sendUserMessage({ communityId, channelId, userId, content, replyToMessageId }) {
    const nextMetadata =
      replyToMessageId && replyToMessageId.trim().length > 0
        ? { replyToMessageId: replyToMessageId.trim() }
        : {};

    const { error } = await supabase.from('messages').insert({
      community_id: communityId,
      channel_id: channelId,
      author_type: 'user',
      author_user_id: userId,
      content,
      metadata: nextMetadata,
    });
    if (error) throw error;
  },

  async editUserMessage({ communityId, messageId, content }) {
    const { error } = await supabase
      .from('messages')
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq('community_id', communityId)
      .eq('id', messageId);
    if (error) throw error;
  },

  async deleteMessage({ communityId, messageId }) {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('community_id', communityId)
      .eq('id', messageId);
    if (error) throw error;
  },

  async reportMessage({ communityId, channelId, messageId, reporterUserId, target, kind, comment }) {
    const reportTitle =
      kind === 'bug' ? 'Message Report: Bug' : 'Message Report: Content Abuse';

    const reportNotes = JSON.stringify({
      type: 'message_report',
      messageId,
      channelId,
      target,
      kind,
      comment,
    });

    const reportId = crypto.randomUUID();

    const { error: reportError } = await supabase
      .from('support_reports')
      .insert({
        id: reportId,
        community_id: communityId,
        reporter_user_id: reporterUserId,
        title: reportTitle,
        notes: reportNotes,
        include_last_n_messages: null,
      });

    if (reportError) throw reportError;

    const { error: channelLinkError } = await supabase.from('support_report_channels').insert({
      report_id: reportId,
      community_id: communityId,
      channel_id: channelId,
    });
    if (channelLinkError) throw channelLinkError;

    const { error: messageLinkError } = await supabase.from('support_report_messages').insert({
      report_id: reportId,
      message_id: messageId,
    });
    if (messageLinkError) throw messageLinkError;
  },

  async postHavenDeveloperMessage({ communityId, channelId, content }) {
    const { error } = await supabase.rpc('post_haven_dev_message', {
      p_community_id: communityId,
      p_channel_id: channelId,
      p_content: content,
      p_metadata: {
        source: 'renderer_dev_mode',
      },
    });
    if (error) throw error;
  },
};
