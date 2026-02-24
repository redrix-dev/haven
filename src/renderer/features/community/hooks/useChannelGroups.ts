import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import type { Channel, ChannelGroupState } from '@/lib/backend/types';

type UseChannelGroupsInput = {
  currentServerId: string | null;
  currentUserId: string | null;
  channels: Channel[];
};

const createEmptyChannelGroupState = (ungroupedChannelIds: string[] = []): ChannelGroupState => ({
  groups: [],
  ungroupedChannelIds,
  collapsedGroupIds: [],
});

export function useChannelGroups({ currentServerId, currentUserId, channels }: UseChannelGroupsInput) {
  const [channelGroupState, setChannelGroupState] = React.useState<ChannelGroupState>(
    createEmptyChannelGroupState()
  );

  const resetChannelGroups = React.useCallback(() => {
    setChannelGroupState(createEmptyChannelGroupState());
  }, []);

  const refreshChannelGroupsState = React.useCallback(
    async (
      communityId = currentServerId,
      channelIds = channels.map((channel) => channel.id)
    ) => {
      if (!communityId) {
        setChannelGroupState(createEmptyChannelGroupState(channelIds));
        return;
      }

      const communityBackend = getCommunityDataBackend(communityId);
      const nextState = await communityBackend.listChannelGroups({
        communityId,
        channelIds,
      });
      setChannelGroupState(nextState);
    },
    [channels, currentServerId]
  );

  React.useEffect(() => {
    let isMounted = true;

    if (!currentServerId) {
      resetChannelGroups();
      return () => {
        isMounted = false;
      };
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    const channelIds = channels.map((channel) => channel.id);

    const loadChannelGroups = async () => {
      try {
        const state = await communityBackend.listChannelGroups({
          communityId: currentServerId,
          channelIds,
        });
        if (!isMounted) return;
        setChannelGroupState(state);
      } catch (error) {
        console.error('Failed to load channel groups:', error);
        if (!isMounted) return;
        setChannelGroupState(createEmptyChannelGroupState(channelIds));
      }
    };

    void loadChannelGroups();

    const groupSubscription = supabase
      .channel(`channel_groups:${currentServerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_groups',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_group_channels',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_group_preferences',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void groupSubscription.unsubscribe();
    };
  }, [channels, currentServerId, resetChannelGroups]);

  const createChannelGroup = React.useCallback(
    async (name: string, channelIdToAssign?: string | null) => {
      if (!currentServerId || !currentUserId) throw new Error('Not authenticated.');
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Group name is required.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      const nextPosition =
        channelGroupState.groups.length === 0
          ? 0
          : Math.max(...channelGroupState.groups.map((group) => group.position)) + 1;

      const createdGroup = await communityBackend.createChannelGroup({
        communityId: currentServerId,
        name: normalizedName,
        position: nextPosition,
        createdByUserId: currentUserId,
      });

      if (channelIdToAssign) {
        await communityBackend.setChannelGroupForChannel({
          communityId: currentServerId,
          channelId: channelIdToAssign,
          groupId: createdGroup.id,
          position: 0,
        });
      }

      await refreshChannelGroupsState(currentServerId);
    },
    [channelGroupState.groups, currentServerId, currentUserId, refreshChannelGroupsState]
  );

  const assignChannelToGroup = React.useCallback(
    async (channelId: string, groupId: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const targetGroup = channelGroupState.groups.find((group) => group.id === groupId);
      if (!targetGroup) throw new Error('Channel group not found.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.setChannelGroupForChannel({
        communityId: currentServerId,
        channelId,
        groupId,
        position: targetGroup.channelIds.length,
      });
      await refreshChannelGroupsState(currentServerId);
    },
    [channelGroupState.groups, currentServerId, refreshChannelGroupsState]
  );

  const removeChannelFromGroup = React.useCallback(
    async (channelId: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.setChannelGroupForChannel({
        communityId: currentServerId,
        channelId,
        groupId: null,
        position: 0,
      });
      await refreshChannelGroupsState(currentServerId);
    },
    [currentServerId, refreshChannelGroupsState]
  );

  const setChannelGroupCollapsed = React.useCallback(
    async (groupId: string, isCollapsed: boolean) => {
      if (!currentServerId) throw new Error('No server selected.');
      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.setChannelGroupCollapsed({
        communityId: currentServerId,
        groupId,
        isCollapsed,
      });

      setChannelGroupState((prev) => ({
        ...prev,
        collapsedGroupIds: isCollapsed
          ? Array.from(new Set([...prev.collapsedGroupIds, groupId]))
          : prev.collapsedGroupIds.filter((id) => id !== groupId),
      }));
    },
    [currentServerId]
  );

  const renameChannelGroup = React.useCallback(
    async (groupId: string, name: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Group name is required.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.renameChannelGroup({
        communityId: currentServerId,
        groupId,
        name: normalizedName,
      });

      setChannelGroupState((prev) => ({
        ...prev,
        groups: prev.groups.map((group) =>
          group.id === groupId ? { ...group, name: normalizedName } : group
        ),
      }));
    },
    [currentServerId]
  );

  const deleteChannelGroup = React.useCallback(
    async (groupId: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.deleteChannelGroup({
        communityId: currentServerId,
        groupId,
      });
      await refreshChannelGroupsState(currentServerId);
    },
    [currentServerId, refreshChannelGroupsState]
  );

  return {
    state: {
      channelGroupState,
    },
    derived: {},
    actions: {
      resetChannelGroups,
      setChannelGroupState,
      refreshChannelGroupsState,
      createChannelGroup,
      assignChannelToGroup,
      removeChannelFromGroup,
      setChannelGroupCollapsed,
      renameChannelGroup,
      deleteChannelGroup,
    },
  };
}
