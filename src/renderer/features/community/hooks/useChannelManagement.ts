import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import type {
  Channel,
  ChannelKind,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelRolePermissionItem,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

type UseChannelManagementInput = {
  currentServerId: string | null;
  currentUserId: string | null;
  currentChannelId: string | null;
  channelSettingsTargetId: string | null;
  channels: Channel[];
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  setCurrentChannelId: React.Dispatch<React.SetStateAction<string | null>>;
  setChannelSettingsTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowChannelSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useChannelManagement({
  currentServerId,
  currentUserId,
  currentChannelId,
  channelSettingsTargetId,
  channels,
  setChannels,
  setCurrentChannelId,
  setChannelSettingsTargetId,
  setShowChannelSettingsModal,
}: UseChannelManagementInput) {
  const [channelRolePermissions, setChannelRolePermissions] = React.useState<ChannelRolePermissionItem[]>(
    []
  );
  const [channelMemberPermissions, setChannelMemberPermissions] = React.useState<
    ChannelMemberPermissionItem[]
  >([]);
  const [channelPermissionMemberOptions, setChannelPermissionMemberOptions] = React.useState<
    ChannelMemberOption[]
  >([]);
  const [channelPermissionsLoading, setChannelPermissionsLoading] = React.useState(false);
  const [channelPermissionsLoadError, setChannelPermissionsLoadError] = React.useState<string | null>(
    null
  );

  const resetChannelPermissionsState = React.useCallback(() => {
    setChannelRolePermissions([]);
    setChannelMemberPermissions([]);
    setChannelPermissionMemberOptions([]);
    setChannelPermissionsLoadError(null);
    setChannelPermissionsLoading(false);
  }, []);

  const createChannel = React.useCallback(
    async (values: { name: string; topic: string | null; kind: ChannelKind }) => {
      if (!currentUserId || !currentServerId) throw new Error('Not authenticated');

      const nextPosition =
        channels.length === 0 ? 0 : Math.max(...channels.map((channel) => channel.position)) + 1;

      const communityBackend = getCommunityDataBackend(currentServerId);
      const channel = await communityBackend.createChannel({
        communityId: currentServerId,
        name: values.name,
        topic: values.topic,
        position: nextPosition,
        kind: values.kind,
      });

      setChannels((prev) => {
        if (prev.some((existingChannel) => existingChannel.id === channel.id)) return prev;
        return [...prev, channel].sort((a, b) => a.position - b.position);
      });
      setCurrentChannelId(channel.id);
    },
    [channels, currentServerId, currentUserId, setChannels, setCurrentChannelId]
  );

  const saveChannelSettings = React.useCallback(
    async (values: { name: string; topic: string | null }) => {
      const channelIdToUpdate = channelSettingsTargetId ?? currentChannelId;
      if (!currentServerId || !channelIdToUpdate) throw new Error('No channel selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.updateChannel({
        communityId: currentServerId,
        channelId: channelIdToUpdate,
        name: values.name,
        topic: values.topic,
      });

      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === channelIdToUpdate
            ? { ...channel, name: values.name, topic: values.topic }
            : channel
        )
      );
    },
    [channelSettingsTargetId, currentChannelId, currentServerId, setChannels]
  );

  const renameChannel = React.useCallback(
    async (channelId: string, name: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const channelRow = channels.find((candidate) => candidate.id === channelId);
      if (!channelRow) throw new Error('Channel not found.');

      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new Error('Channel name is required.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.updateChannel({
        communityId: currentServerId,
        channelId,
        name: normalizedName,
        topic: channelRow.topic,
      });

      setChannels((prev) =>
        prev.map((channel) => (channel.id === channelId ? { ...channel, name: normalizedName } : channel))
      );
    },
    [channels, currentServerId, setChannels]
  );

  const deleteChannel = React.useCallback(
    async (channelId: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      if (channels.length <= 1) {
        throw new Error('At least one channel must exist in a server.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.deleteChannel({
        communityId: currentServerId,
        channelId,
      });

      setChannels((prev) => {
        const next = prev.filter((channel) => channel.id !== channelId);
        setCurrentChannelId((prevCurrentId) => {
          if (prevCurrentId !== channelId) return prevCurrentId;
          return next.length > 0 ? next[0].id : null;
        });
        return next;
      });

      setChannelSettingsTargetId((prevTargetId) => (prevTargetId === channelId ? null : prevTargetId));
    },
    [channels.length, currentServerId, setChannelSettingsTargetId, setChannels, setCurrentChannelId]
  );

  const deleteCurrentChannel = React.useCallback(async () => {
    const targetChannelId = channelSettingsTargetId ?? currentChannelId;
    if (!targetChannelId) throw new Error('No channel selected.');
    await deleteChannel(targetChannelId);
    setShowChannelSettingsModal(false);
  }, [
    channelSettingsTargetId,
    currentChannelId,
    deleteChannel,
    setShowChannelSettingsModal,
  ]);

  const loadChannelPermissions = React.useCallback(
    async (targetChannelId = channelSettingsTargetId ?? currentChannelId) => {
      if (!currentServerId || !targetChannelId || !currentUserId) {
        setChannelRolePermissions([]);
        setChannelMemberPermissions([]);
        setChannelPermissionMemberOptions([]);
        return;
      }

      setChannelPermissionsLoadError(null);
      setChannelPermissionsLoading(true);
      try {
        const communityBackend = getCommunityDataBackend(currentServerId);
        const snapshot = await communityBackend.fetchChannelPermissions({
          communityId: currentServerId,
          channelId: targetChannelId,
          userId: currentUserId,
        });

        setChannelRolePermissions(snapshot.rolePermissions);
        setChannelMemberPermissions(snapshot.memberPermissions);
        setChannelPermissionMemberOptions(snapshot.memberOptions);
      } finally {
        setChannelPermissionsLoading(false);
      }
    },
    [channelSettingsTargetId, currentChannelId, currentServerId, currentUserId]
  );

  const openChannelSettingsModal = React.useCallback(
    async (channelId?: string) => {
      const targetChannelId = channelId ?? currentChannelId;
      if (!targetChannelId) return;
      setChannelSettingsTargetId(targetChannelId);
      setShowChannelSettingsModal(true);
      setChannelPermissionsLoadError(null);
      try {
        await loadChannelPermissions(targetChannelId);
      } catch (error: unknown) {
        console.error('Failed to load channel permissions:', error);
        setChannelPermissionsLoadError(getErrorMessage(error, 'Failed to load channel permissions.'));
      }
    },
    [
      currentChannelId,
      loadChannelPermissions,
      setChannelSettingsTargetId,
      setShowChannelSettingsModal,
    ]
  );

  const saveRoleChannelPermissions = React.useCallback(
    async (roleId: string, permissions: ChannelPermissionState) => {
      const targetChannelId = channelSettingsTargetId ?? currentChannelId;
      if (!currentServerId || !targetChannelId) throw new Error('No channel selected.');

      const roleRow = channelRolePermissions.find((row) => row.roleId === roleId);
      if (roleRow && !roleRow.editable) {
        throw new Error('You can only edit overwrites for roles below your highest role.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.saveRoleChannelPermissions({
        communityId: currentServerId,
        channelId: targetChannelId,
        roleId,
        permissions,
      });

      setChannelRolePermissions((prev) =>
        prev.map((row) =>
          row.roleId === roleId
            ? {
                ...row,
                canView: permissions.canView,
                canSend: permissions.canSend,
                canManage: permissions.canManage,
              }
            : row
        )
      );
    },
    [channelRolePermissions, channelSettingsTargetId, currentChannelId, currentServerId]
  );

  const saveMemberChannelPermissions = React.useCallback(
    async (memberId: string, permissions: ChannelPermissionState) => {
      const targetChannelId = channelSettingsTargetId ?? currentChannelId;
      if (!currentServerId || !targetChannelId) throw new Error('No channel selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.saveMemberChannelPermissions({
        communityId: currentServerId,
        channelId: targetChannelId,
        memberId,
        permissions,
      });

      setChannelMemberPermissions((prev) =>
        prev.map((row) =>
          row.memberId === memberId
            ? {
                ...row,
                canView: permissions.canView,
                canSend: permissions.canSend,
                canManage: permissions.canManage,
              }
            : row
        )
      );
    },
    [channelSettingsTargetId, currentChannelId, currentServerId]
  );

  return {
    state: {
      channelRolePermissions,
      channelMemberPermissions,
      channelPermissionMemberOptions,
      channelPermissionsLoading,
      channelPermissionsLoadError,
    },
    derived: {},
    actions: {
      resetChannelPermissionsState,
      createChannel,
      saveChannelSettings,
      renameChannel,
      deleteChannel,
      deleteCurrentChannel,
      loadChannelPermissions,
      openChannelSettingsModal,
      saveRoleChannelPermissions,
      saveMemberChannelPermissions,
    },
  };
}
