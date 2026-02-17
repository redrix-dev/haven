import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  AuthorProfile,
  Channel,
  ChannelCreateInput,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
  ChannelRolePermissionItem,
  Message,
  ServerPermissions,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
} from './types';

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
      { data: canCreateChannels },
      { data: canManageChannels },
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
        p_permission_key: 'create_channels',
      }),
      supabase.rpc('user_has_permission', {
        p_community_id: communityId,
        p_permission_key: 'manage_channels',
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
      canCreateChannels: owner || Boolean(canCreateChannels) || manageChannels,
      canManageChannels: manageChannels,
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
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        onChange
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

  async createChannel(input) {
    const { data, error } = await supabase
      .from('channels')
      .insert({
        community_id: input.communityId,
        name: input.name,
        topic: input.topic,
        created_by_user_id: input.createdByUserId,
        position: input.position,
        kind: input.kind,
      })
      .select('*')
      .single();

    if (error) throw error;
    if (!data) throw new Error('Failed to create channel.');
    return data;
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

    const allMemberOptions: ChannelMemberOption[] = (members ?? [])
      .map((member: any) => {
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

  async sendUserMessage({ communityId, channelId, userId, content }) {
    const { error } = await supabase.from('messages').insert({
      community_id: communityId,
      channel_id: channelId,
      author_type: 'user',
      author_user_id: userId,
      content,
    });
    if (error) throw error;
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
