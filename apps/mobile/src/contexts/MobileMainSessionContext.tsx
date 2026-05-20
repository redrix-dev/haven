import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dataCacheDebug, useDataCacheComponentProbe } from "@shared/debug";
import {
  applyCommunityFocus,
  toChannel,
  resolvePreferredChannelIdForServer,
  prefetchCommunityChannelMessages,
  toServerSummaries,
  deriveCommunitiesLoadStatus,
  useHavenCore,
} from "@shared/core";
import { hydrateCommunityPermissions } from "@shared/features/community/communityPermissionsHydration";
import { useUiStore } from "@shared/stores/uiStore";
import type { Channel, ServerSummary } from "@shared/lib/backend/types";
import { getLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";

type ServersReturn = {
  servers: ServerSummary[];
  status: ReturnType<typeof deriveCommunitiesLoadStatus>;
  error: string | null;
  loading: boolean;
  refreshServers: () => Promise<void>;
  createServer: (name: string) => Promise<{ id: string }>;
};

type CommunityWorkspaceState = {
  channels: Channel[];
  channelsLoading: boolean;
  channelsError: string | null;
};

type CommunityWorkspaceDerived = {
  currentServer: ServersReturn["servers"][number] | null;
  currentChannel: Channel | null;
  currentChannelBelongsToCurrentServer: boolean;
  channelSettingsTarget: Channel | null;
  currentRenderableChannel: Channel | null;
  currentChannelKind: Channel["kind"] | null;
};

type CommunityWorkspaceActions = {
  resetChannelsWorkspace: () => void;
  prefetchServersChannels: (serverIds: string[]) => Promise<void>;
  prefetchMessageCachesForServers: (
    serverIds: string[],
    prefetchChannelMessages: (serverId: string, channelId: string) => Promise<void>,
  ) => Promise<void>;
  getDefaultChannelIdForServer: (
    serverId: string,
    lastVisitedChannelId?: string | null,
  ) => string | null;
};

type CommunityWorkspaceReturn = {
  state: CommunityWorkspaceState;
  derived: CommunityWorkspaceDerived;
  actions: CommunityWorkspaceActions;
};

type MobileMainSessionContextValue = {
  servers: ServersReturn["servers"];
  serversStatus: ServersReturn["status"];
  serversError: ServersReturn["error"];
  serversLoading: ServersReturn["loading"];
  refreshServers: ServersReturn["refreshServers"];
  createServer: ServersReturn["createServer"];
  communityWorkspace: CommunityWorkspaceReturn;
  warmCommunityForEntry: (serverId: string) => Promise<void>;
};

const MobileMainSessionContext = createContext<MobileMainSessionContextValue | null>(
  null,
);

const PREFETCH_TEXT_CHANNELS_PER_SERVER = 8;

export function MobileMainSessionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const core = useHavenCore();
  const nexusCommunities = core.communities.useCommunities();
  const serversLoading = core.communities.useIsLoading();
  const serversLoadError = core.communities.useLoadError();
  const servers = useMemo(
    () => toServerSummaries(nexusCommunities),
    [nexusCommunities],
  );
  const status = deriveCommunitiesLoadStatus({
    hasUser: Boolean(userId),
    isLoading: serversLoading,
    loadError: serversLoadError,
    communityCount: nexusCommunities.length,
  });
  const error = serversLoadError;

  const refreshServers = useCallback(async () => {
    await core.refreshCommunities(userId);
  }, [core, userId]);

  const createServer = useCallback(
    async (name: string) => core.createCommunity(userId, name),
    [core, userId],
  );

  const loading = serversLoading;
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = core.channels.useActiveChannelId();
  const channelSettingsTargetId = useUiStore(
    (state) => state.channelSettingsTargetId,
  );

  const havenChannels = core.channels.useChannels(currentServerId ?? "__none__");
  const channelsLoading = core.channels.useIsLoading(currentServerId ?? "__none__");
  const channels = useMemo(
    () => havenChannels.map(toChannel),
    [havenChannels],
  );
  const [channelsError, setChannelsError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentServerId) return;
    setChannelsError(null);
    void core.channels.ensureLoaded(currentServerId).catch((err) => {
      console.warn("[MobileMainSession] ensureLoaded failed", err);
      setChannelsError(
        err instanceof Error ? err.message : "Failed to load channels.",
      );
    });
  }, [core, currentServerId]);

  useEffect(() => {
    if (!currentServerId || channels.length === 0) return;
    const valid =
      currentChannelId != null &&
      channels.some((channel) => channel.id === currentChannelId);
    if (valid) return;
    const preferred = resolvePreferredChannelIdForServer(
      core,
      currentServerId,
      channels,
      { previousChannelId: currentChannelId },
    );
    core.communities.setActiveId(currentServerId);
    core.channels.setActiveChannelId(preferred);
  }, [channels, core, currentChannelId, currentServerId]);

  useEffect(() => {
    if (!userId || !currentServerId) {
      if (currentServerId) {
        core.permissions.invalidate(currentServerId);
      }
      return;
    }
    void hydrateCommunityPermissions(currentServerId);
  }, [core, currentServerId, userId]);

  const currentServer = useMemo(
    () => servers.find((server) => server.id === currentServerId) ?? null,
    [servers, currentServerId],
  );

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId],
  );

  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel &&
      currentServerId &&
      currentChannel.community_id === currentServerId,
  );

  const channelSettingsTarget = useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.id === (channelSettingsTargetId ?? currentChannelId),
      ) ?? null,
    [channels, channelSettingsTargetId, currentChannelId],
  );

  const currentRenderableChannel = useMemo(
    () =>
      currentChannel &&
      currentChannelBelongsToCurrentServer &&
      currentChannel.kind === "text"
        ? currentChannel
        : (channels.find(
            (channel) =>
              channel.kind === "text" &&
              (!currentServerId || channel.community_id === currentServerId),
          ) ?? (currentChannelBelongsToCurrentServer ? currentChannel : null)),
    [
      channels,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      currentServerId,
    ],
  );

  const currentChannelKind = currentChannel?.kind ?? null;

  const resetChannelsWorkspace = useCallback(() => {
    setChannelsError(null);
    if (currentServerId) {
      core.channels.setActiveChannelId(null);
    }
  }, [core, currentServerId]);

  const prefetchServersChannels = useCallback(
    async (serverIds: string[]) => {
      await Promise.allSettled(
        serverIds.map((id) => core.channels.ensureLoaded(id)),
      );
    },
    [core],
  );

  const prefetchMessageCachesForServers = useCallback(
    async (
      serverIds: string[],
      prefetchChannelMessages: (
        serverId: string,
        channelId: string,
      ) => Promise<void>,
    ) => {
      await Promise.allSettled(
        serverIds.flatMap((serverId) => {
          const list = core.channels.getChannelsSnapshot(serverId);
          return list
            .filter((channel) => channel.kind === "text")
            .slice(0, PREFETCH_TEXT_CHANNELS_PER_SERVER)
            .map((channel) => prefetchChannelMessages(serverId, channel.id));
        }),
      );
    },
    [core],
  );

  const getDefaultChannelIdForServer = useCallback(
    (serverId: string, lastVisitedChannelId?: string | null): string | null => {
      const channelList = core.channels
        .getChannelsSnapshot(serverId)
        .map(toChannel);
      if (channelList.length === 0) return null;
      return resolvePreferredChannelIdForServer(core, serverId, channelList, {
        lastVisitedChannelId,
      });
    },
    [core],
  );

  const communityWorkspace = useMemo<CommunityWorkspaceReturn>(
    () => ({
      state: { channels, channelsLoading, channelsError },
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
        prefetchServersChannels,
        prefetchMessageCachesForServers,
        getDefaultChannelIdForServer,
      },
    }),
    [
      channelSettingsTarget,
      channels,
      channelsError,
      channelsLoading,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      currentChannelKind,
      currentRenderableChannel,
      currentServer,
      getDefaultChannelIdForServer,
      prefetchMessageCachesForServers,
      prefetchServersChannels,
      resetChannelsWorkspace,
    ],
  );

  const warmCommunityForEntry = useCallback(
    async (serverId: string) => {
      dataCacheDebug.lifecycle("MobileMainSession", "warmCommunityForEntry start", {
        serverId,
      });
      await communityWorkspace.actions.prefetchServersChannels([serverId]);

      const lastVisited = await getLastTextChannelIdForCommunity(serverId);
      const channelId = communityWorkspace.actions.getDefaultChannelIdForServer(
        serverId,
        lastVisited,
      );

      dataCacheDebug.lifecycle("MobileMainSession", "warmCommunityForEntry channel resolved", {
        serverId,
        channelId,
        lastVisited,
      });

      if (channelId) {
        await prefetchCommunityChannelMessages({
          serverId,
          channelId,
        });
      }

      applyCommunityFocus(core, serverId, { lastVisitedChannelId: lastVisited });

      dataCacheDebug.lifecycle("MobileMainSession", "warmCommunityForEntry complete", {
        serverId,
        channelId,
      });
    },
    [communityWorkspace.actions, core, userId],
  );

  useDataCacheComponentProbe("MobileMainSession", {
    navServerId: currentServerId,
    navChannelId: currentChannelId,
    serversCount: servers.length,
    serversStatus: status,
    channelsCount: communityWorkspace.state.channels.length,
    channelsLoading: communityWorkspace.state.channelsLoading,
    currentRenderableChannelId:
      communityWorkspace.derived.currentRenderableChannel?.id ?? null,
  });

  const value = useMemo<MobileMainSessionContextValue>(
    () => ({
      servers,
      serversStatus: status,
      serversError: error,
      serversLoading: loading,
      refreshServers,
      createServer,
      communityWorkspace,
      warmCommunityForEntry,
    }),
    [
      communityWorkspace,
      createServer,
      error,
      loading,
      refreshServers,
      servers,
      status,
      warmCommunityForEntry,
    ],
  );

  return (
    <MobileMainSessionContext.Provider value={value}>
      {children}
    </MobileMainSessionContext.Provider>
  );
}

export function useMobileMainSession(): MobileMainSessionContextValue {
  const ctx = useContext(MobileMainSessionContext);
  if (!ctx) {
    throw new Error("useMobileMainSession requires MobileMainSessionProvider.");
  }
  return ctx;
}

export function useMobileCommunityWorkspace(): CommunityWorkspaceReturn {
  return useMobileMainSession().communityWorkspace;
}

export function useMobileServersFromSession() {
  const { servers, serversStatus, serversError, serversLoading, refreshServers } =
    useMobileMainSession();
  return {
    servers,
    status: serversStatus,
    error: serversError,
    loading: serversLoading,
    refreshServers,
  };
}
