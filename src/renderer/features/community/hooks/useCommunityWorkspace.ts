import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import type { Channel, ServerPermissions, ServerSummary } from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

const EMPTY_SERVER_PERMISSIONS: ServerPermissions = {
  isOwner: false,
  canManageServer: false,
  canManageRoles: false,
  canManageMembers: false,
  canCreateChannels: false,
  canManageChannels: false,
  canManageMessages: false,
  canManageBans: false,
  canCreateReports: false,
  canRefreshLinkPreviews: false,
  canManageDeveloperAccess: false,
  canManageInvites: false,
};

type UseCommunityWorkspaceInput = {
  servers: ServerSummary[];
  currentUserId: string | null;
  channelSettingsTargetId: string | null;
};

export function useCommunityWorkspace({
  servers,
  currentUserId,
  channelSettingsTargetId,
}: UseCommunityWorkspaceInput) {
  const [currentServerId, setCurrentServerId] = React.useState<string | null>(null);
  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = React.useState(false);
  const [channelsError, setChannelsError] = React.useState<string | null>(null);
  const [currentChannelId, setCurrentChannelId] = React.useState<string | null>(null);
  const [serverPermissions, setServerPermissions] = React.useState<ServerPermissions>(
    EMPTY_SERVER_PERMISSIONS
  );
  const channelsByServerCacheRef = React.useRef<Record<string, Channel[]>>({});
  const lastSelectedChannelIdByServerRef = React.useRef<Record<string, string | null>>({});

  const resetChannelsWorkspace = React.useCallback(() => {
    setChannels([]);
    setChannelsLoading(false);
    setChannelsError(null);
    setCurrentChannelId(null);
  }, []);

  const resetServerPermissions = React.useCallback(() => {
    setServerPermissions(EMPTY_SERVER_PERMISSIONS);
  }, []);

  const prefetchServersChannels = React.useCallback(async (serverIds: string[]) => {
    await Promise.allSettled(
      serverIds
        .filter((id) => !Object.prototype.hasOwnProperty.call(channelsByServerCacheRef.current, id))
        .map(async (id) => {
          try {
            const communityBackend = getCommunityDataBackend(id);
            const channelList = await communityBackend.listChannels(id);
            channelsByServerCacheRef.current[id] = channelList;
          } catch {
            // silent — prefetch failures are non-fatal
          }
        })
    );
  }, []);

  const getDefaultChannelIdForServer = React.useCallback(
    (serverId: string, lastVisitedChannelId?: string | null): string | null => {
      const cached = channelsByServerCacheRef.current[serverId];
      if (!cached || cached.length === 0) return null;
      const rememberedId = lastSelectedChannelIdByServerRef.current[serverId] ?? null;
      const candidates = [lastVisitedChannelId ?? null, rememberedId];
      for (const candidate of candidates) {
        if (candidate && cached.some((c) => c.id === candidate)) return candidate;
      }
      return cached.find((c) => c.kind === 'text')?.id ?? cached[0]?.id ?? null;
    },
    []
  );

  React.useEffect(() => {
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [servers, currentServerId]);

  React.useEffect(() => {
    if (!currentServerId) return;
    if (!currentChannelId) return;
    lastSelectedChannelIdByServerRef.current[currentServerId] = currentChannelId;
  }, [currentServerId, currentChannelId]);

  React.useEffect(() => {
    let isMounted = true;

    if (!currentServerId) {
      resetChannelsWorkspace();
      return () => {
        isMounted = false;
      };
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    const hasCachedChannels = Object.prototype.hasOwnProperty.call(
      channelsByServerCacheRef.current,
      currentServerId
    );
    const cachedChannels = hasCachedChannels ? channelsByServerCacheRef.current[currentServerId] ?? [] : null;

    const resolvePreferredChannelId = (channelList: Channel[], previousChannelId: string | null) => {
      if (channelList.length === 0) return null;

      const rememberedChannelId = lastSelectedChannelIdByServerRef.current[currentServerId] ?? null;
      const candidates = [rememberedChannelId, previousChannelId];
      for (const candidate of candidates) {
        if (candidate && channelList.some((channel) => channel.id === candidate)) {
          return candidate;
        }
      }

      const firstTextChannel = channelList.find((channel) => channel.kind === 'text');
      return firstTextChannel?.id ?? channelList[0].id;
    };

    if (cachedChannels) {
      setChannels(cachedChannels);
      setChannelsError(null);
      setChannelsLoading(false);
      setCurrentChannelId((prev) => resolvePreferredChannelId(cachedChannels, prev));
    }

    const loadChannels = async (options?: { blocking?: boolean }) => {
      if (options?.blocking === true) {
        setChannelsLoading(true);
      } else if (!hasCachedChannels) {
        setChannelsLoading(true);
      }
      setChannelsError(null);
      try {
        const channelList = await communityBackend.listChannels(currentServerId);

        if (!isMounted) return;

        channelsByServerCacheRef.current[currentServerId] = channelList;
        setChannels(channelList);
        setCurrentChannelId((prev) => resolvePreferredChannelId(channelList, prev));
      } catch (error: unknown) {
        if (!isMounted) return;
        console.error('Error loading channels:', error);
        if (!hasCachedChannels) {
          setChannels([]);
          setCurrentChannelId(null);
        }
        setChannelsError(getErrorMessage(error, 'Failed to load channels.'));
      }

      setChannelsLoading(false);
    };

    void loadChannels({ blocking: !hasCachedChannels });

    const subscription = communityBackend.subscribeToChannels(currentServerId, () => {
      void loadChannels({ blocking: false });
    });

    return () => {
      isMounted = false;
      void subscription.unsubscribe();
    };
  }, [currentServerId, resetChannelsWorkspace]);

  React.useEffect(() => {
    let isMounted = true;

    if (!currentUserId || !currentServerId) {
      resetServerPermissions();
      return () => {
        isMounted = false;
      };
    }

    const loadPermissions = async () => {
      try {
        const communityBackend = getCommunityDataBackend(currentServerId);
        const permissions = await communityBackend.fetchServerPermissions(currentServerId);

        if (!isMounted) return;
        setServerPermissions(permissions);
      } catch (error) {
        console.error('Error loading server permissions:', error);
        if (!isMounted) return;
        resetServerPermissions();
      }
    };

    void loadPermissions();

    return () => {
      isMounted = false;
    };
  }, [currentServerId, currentUserId, resetServerPermissions]);

  const currentServer = React.useMemo(
    () => servers.find((server) => server.id === currentServerId) ?? null,
    [servers, currentServerId]
  );
  const currentChannel = React.useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId]
  );
  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel && currentServerId && currentChannel.community_id === currentServerId
  );
  const channelSettingsTarget = React.useMemo(
    () => channels.find((channel) => channel.id === (channelSettingsTargetId ?? currentChannelId)) ?? null,
    [channels, channelSettingsTargetId, currentChannelId]
  );
  const currentRenderableChannel = React.useMemo(
    () =>
      currentChannel && currentChannelBelongsToCurrentServer && currentChannel.kind === 'text'
        ? currentChannel
        : channels.find(
            (channel) => channel.kind === 'text' && (!currentServerId || channel.community_id === currentServerId)
          ) ??
          (currentChannelBelongsToCurrentServer ? currentChannel : null),
    [channels, currentChannel, currentChannelBelongsToCurrentServer, currentServerId]
  );
  const currentChannelKind = currentChannel?.kind ?? null;

  return {
    state: {
      channels,
      channelsLoading,
      channelsError,
      currentChannelId,
      currentServerId,
      serverPermissions,
    },
    derived: {
      currentServer,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      channelSettingsTarget,
      currentRenderableChannel,
      currentChannelKind,
    },
    actions: {
      resetChannelsWorkspace,
      setChannels,
      setCurrentChannelId,
      setCurrentServerId,
      resetServerPermissions,
      prefetchServersChannels,
      getDefaultChannelIdForServer,
    },
  };
}
