import React from "react";
import { dataCacheDebug } from "@shared/debug";
import { getCommunityDataBackend } from "@shared/lib/backend";
import { hydrateCommunityPermissions } from "@shared/features/community/communityPermissionsHydration";
import type {
  Channel,
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
  ReportStatusUpdatedBroadcastPayload,
  ServerSummary,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useUiStore } from "@shared/stores";
import {
  stableOnMemberBanned,
  stableOnMemberChannelAccessRevoked,
} from "@shared/infrastructure/realtime/communityAccessBroadcastBridge";

/**
 * Cross-hook channel list cache (e.g. mobile shell + chat must share one list).
 * Survives screen unmount; cleared on sign-out / account switch.
 */
const crossSessionChannelsByServer: Record<string, Channel[]> =
  Object.create(null);
const crossSessionLastChannelIdByServer: Record<string, string | null> =
  Object.create(null);

export function getCachedChannelsForServer(serverId: string): Channel[] | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      crossSessionChannelsByServer,
      serverId,
    )
  ) {
    dataCacheDebug.cacheRead("useCommunityWorkspace", "channels miss", { serverId });
    return null;
  }
  const channels = crossSessionChannelsByServer[serverId] ?? [];
  dataCacheDebug.cacheRead("useCommunityWorkspace", "channels hit", {
    serverId,
    count: channels.length,
  });
  return channels;
}

/** Shared channel pick logic for workspace load, warm prefetch, and mobile entry. */
export function resolvePreferredChannelIdForServer(
  serverId: string,
  channelList: Channel[],
  options?: {
    lastVisitedChannelId?: string | null;
    previousChannelId?: string | null;
  },
): string | null {
  if (channelList.length === 0) return null;

  const rememberedId = crossSessionLastChannelIdByServer[serverId] ?? null;
  const previousId = options?.previousChannelId ?? null;
  const previousValid =
    previousId &&
    channelList.some(
      (channel) => channel.id === previousId && channel.community_id === serverId,
    )
      ? previousId
      : null;

  const candidates = [
    options?.lastVisitedChannelId ?? null,
    rememberedId,
    previousValid,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      channelList.some((channel) => channel.id === candidate)
    ) {
      return candidate;
    }
  }

  const firstTextChannel = channelList.find((channel) => channel.kind === "text");
  return firstTextChannel?.id ?? channelList[0].id;
}

export function clearCrossSessionCommunityWorkspaceCaches(): void {
  dataCacheDebug.cacheWrite("useCommunityWorkspace", "clearCrossSessionCommunityWorkspaceCaches");
  for (const key of Object.keys(crossSessionChannelsByServer)) {
    delete crossSessionChannelsByServer[key];
  }
  for (const key of Object.keys(crossSessionLastChannelIdByServer)) {
    delete crossSessionLastChannelIdByServer[key];
  }
}

type UseCommunityWorkspaceInput = {
  servers: ServerSummary[];
  currentUserId: string | null;
  /** When false, do not auto-pick the first server if none is selected (e.g. haven-rev2 community list). Default true. */
  autoSelectFirstServer?: boolean;
  onMemberBanned?: (payload: MemberBannedBroadcastPayload) => void;
  onMemberChannelAccessRevoked?: (
    payload: MemberChannelAccessRevokedBroadcastPayload,
  ) => void;
  onReportStatusUpdated?: (
    payload: ReportStatusUpdatedBroadcastPayload,
  ) => void;
};

export function useCommunityWorkspace({
  servers,
  currentUserId,
  autoSelectFirstServer = true,
  onMemberBanned = stableOnMemberBanned,
  onMemberChannelAccessRevoked = stableOnMemberChannelAccessRevoked,
  onReportStatusUpdated,
}: UseCommunityWorkspaceInput) {
  const channelSettingsTargetId = useUiStore(
    (state) => state.channelSettingsTargetId,
  )
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setCurrentServerId = useNavigationStore(
    (state) => state.setCurrentServerId,
  );
  const currentChannelId = useNavigationStore(
    (state) => state.currentChannelId,
  );
  const setCurrentChannelId = useNavigationStore(
    (state) => state.setCurrentChannelId,
  );
  const setCommunityNavigation = useNavigationStore(
    (state) => state.setCommunityNavigation,
  );

  const initialChannels = React.useMemo(() => {
    if (!currentServerId) return [];
    return getCachedChannelsForServer(currentServerId) ?? [];
  }, [currentServerId]);

  const [channels, setChannels] = React.useState<Channel[]>(initialChannels);
  const [channelsLoading, setChannelsLoading] = React.useState(false);
  const [channelsError, setChannelsError] = React.useState<string | null>(null);
  const [reportStatusRefreshVersion, setReportStatusRefreshVersion] =
    React.useState(0);

  React.useEffect(() => {
    if (!currentServerId) {
      setChannels([]);
      return;
    }
    dataCacheDebug.hydration("useCommunityWorkspace", "server hydrate effect", {
      currentServerId,
    });
    const cached = getCachedChannelsForServer(currentServerId);
    if (cached) {
      setChannels(cached);
      const nav = useNavigationStore.getState();
      if (nav.currentServerId === currentServerId) {
        const currentValid =
          nav.currentChannelId != null &&
          cached.some((channel) => channel.id === nav.currentChannelId);
        if (!currentValid) {
          const preferred = resolvePreferredChannelIdForServer(
            currentServerId,
            cached,
            { previousChannelId: nav.currentChannelId },
          );
          setCommunityNavigation(currentServerId, preferred);
        }
      }
      dataCacheDebug.hydration("useCommunityWorkspace", "channels state hydrated", {
        currentServerId,
        count: cached.length,
      });
    }
  }, [currentServerId, setCommunityNavigation]);

  const resetChannelsWorkspace = React.useCallback(() => {
    setChannels([]);
    setChannelsLoading(false);
    setChannelsError(null);
    setCurrentChannelId(null);
  }, [setCurrentChannelId]);

  const prefetchServersChannels = React.useCallback(
    async (serverIds: string[]) => {
      await Promise.allSettled(
        serverIds
          .filter(
            (id) =>
              !Object.prototype.hasOwnProperty.call(
                crossSessionChannelsByServer,
                id,
              ),
          )
          .map(async (id) => {
            try {
              const communityBackend = getCommunityDataBackend(id);
              const channelList = await communityBackend.listChannels(id);
              crossSessionChannelsByServer[id] = channelList;
              dataCacheDebug.cacheWrite("useCommunityWorkspace", "prefetchServersChannels", {
                serverId: id,
                count: channelList.length,
              });
            } catch (error) {
              dataCacheDebug.fetch(
                "useCommunityWorkspace",
                "prefetchServersChannels failed",
                { serverId: id, error: String(error) },
                "warn",
              );
            }
          }),
      );
    },
    [],
  );

  const PREFETCH_TEXT_CHANNELS_PER_SERVER = 8;

  const prefetchMessageCachesForServers = React.useCallback(
    async (
      serverIds: string[],
      prefetchChannelMessages: (
        serverId: string,
        channelId: string,
      ) => Promise<void>,
    ) => {
      await Promise.allSettled(
        serverIds.flatMap((serverId) => {
          const channelList = crossSessionChannelsByServer[serverId] ?? [];
          return channelList
            .filter((channel) => channel.kind === "text")
            .slice(0, PREFETCH_TEXT_CHANNELS_PER_SERVER)
            .map((channel) => prefetchChannelMessages(serverId, channel.id));
        }),
      );
    },
    [],
  );

  const getDefaultChannelIdForServer = React.useCallback(
    (serverId: string, lastVisitedChannelId?: string | null): string | null => {
      const cached = crossSessionChannelsByServer[serverId];
      if (!cached || cached.length === 0) return null;
      return resolvePreferredChannelIdForServer(serverId, cached, {
        lastVisitedChannelId,
      });
    },
    [],
  );

  // Auto-select first server if none selected (legacy / single-stack community entry)
  React.useEffect(() => {
    if (!autoSelectFirstServer) return;
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [autoSelectFirstServer, servers, currentServerId, setCurrentServerId]);

  // Remember last selected channel per server
  React.useEffect(() => {
    if (!currentServerId) return;
    if (!currentChannelId) return;
    crossSessionLastChannelIdByServer[currentServerId] = currentChannelId;
  }, [currentServerId, currentChannelId]);

  // Load channels when server changes
  React.useEffect(() => {
    let isMounted = true;

    if (!currentServerId) {
      dataCacheDebug.lifecycle("useCommunityWorkspace", "no currentServerId — reset workspace");
      resetChannelsWorkspace();
      return () => {
        isMounted = false;
      };
    }

    dataCacheDebug.fetch("useCommunityWorkspace", "loadChannels effect start", {
      currentServerId,
      currentChannelId,
      hasCachedChannels: Object.prototype.hasOwnProperty.call(
        crossSessionChannelsByServer,
        currentServerId,
      ),
    });

    const communityBackend = getCommunityDataBackend(currentServerId);
    const hasCachedChannels = Object.prototype.hasOwnProperty.call(
      crossSessionChannelsByServer,
      currentServerId,
    );
    const cachedChannels = hasCachedChannels
      ? (crossSessionChannelsByServer[currentServerId] ?? [])
      : null;

    const navigationChannelId = useNavigationStore.getState().currentChannelId;

    if (cachedChannels) {
      const preferred = resolvePreferredChannelIdForServer(
        currentServerId,
        cachedChannels,
        { previousChannelId: navigationChannelId },
      );
      setChannels(cachedChannels);
      setChannelsError(null);
      setChannelsLoading(false);
      setCommunityNavigation(currentServerId, preferred);
      dataCacheDebug.navigation("useCommunityWorkspace", "channel from cache", {
        currentServerId,
        preferredChannelId: preferred,
        channelCount: cachedChannels.length,
      });
    }

    const loadChannels = async (options?: { blocking?: boolean }) => {
      if (options?.blocking === true) {
        setChannelsLoading(true);
      } else if (!hasCachedChannels) {
        setChannelsLoading(true);
      }
      setChannelsError(null);
      try {
        const channelList =
          await communityBackend.listChannels(currentServerId);

        if (!isMounted) return;

        crossSessionChannelsByServer[currentServerId] = channelList;
        setChannels(channelList);
        const nextChannelId = resolvePreferredChannelIdForServer(
          currentServerId,
          channelList,
          { previousChannelId: useNavigationStore.getState().currentChannelId },
        );
        setCommunityNavigation(currentServerId, nextChannelId);
        dataCacheDebug.fetch("useCommunityWorkspace", "loadChannels success", {
          currentServerId,
          channelCount: channelList.length,
          nextChannelId,
          blocking: options?.blocking === true,
        });
        dataCacheDebug.cacheWrite("useCommunityWorkspace", "channels cached", {
          currentServerId,
          channelCount: channelList.length,
        });
      } catch (error: unknown) {
        if (!isMounted) return;
        dataCacheDebug.fetch(
          "useCommunityWorkspace",
          "loadChannels error",
          { currentServerId, error: String(error) },
          "error",
        );
        console.error("Error loading channels:", error);
        if (!hasCachedChannels) {
          setChannels([]);
          setCommunityNavigation(currentServerId, null);
        }
        setChannelsError(getErrorMessage(error, "Failed to load channels."));
      }

      setChannelsLoading(false);
    };

    void loadChannels({ blocking: !hasCachedChannels });

    const subscription = communityBackend.subscribeToChannels(
      currentServerId,
      () => {
        dataCacheDebug.realtime("useCommunityWorkspace", "channels subscription event", {
          currentServerId,
        });
        void loadChannels({ blocking: false });
      },
      {
        onMemberBanned,
        onMemberChannelAccessRevoked,
        onReportStatusUpdated: (payload) => {
          setReportStatusRefreshVersion((current) => current + 1);
          onReportStatusUpdated?.(payload);
        },
      },
    );

    return () => {
      isMounted = false;
      void subscription.unsubscribe();
    };
  }, [
    currentServerId,
    onMemberBanned,
    onMemberChannelAccessRevoked,
    onReportStatusUpdated,
    resetChannelsWorkspace,
    setCommunityNavigation,
  ]);

  // Load permissions when server or user changes
  React.useEffect(() => {
    if (!currentUserId || !currentServerId) {
      if (currentServerId) {
        usePermissionsStore.getState().clearPermissions(currentServerId);
      }
      return;
    }

    void hydrateCommunityPermissions(currentServerId);
  }, [currentServerId, currentUserId]);

  // Derived values
  const currentServer = React.useMemo(
    () => servers.find((server) => server.id === currentServerId) ?? null,
    [servers, currentServerId],
  );

  const currentChannel = React.useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId],
  );

  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel &&
    currentServerId &&
    currentChannel.community_id === currentServerId,
  );

  const channelSettingsTarget = React.useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.id === (channelSettingsTargetId ?? currentChannelId),
      ) ?? null,
    [channels, channelSettingsTargetId, currentChannelId],
  );

  const currentRenderableChannel = React.useMemo(
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

  return {
    state: {
      channels,
      channelsLoading,
      channelsError,
    },
    derived: {
      currentServer,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      channelSettingsTarget,
      currentRenderableChannel,
      currentChannelKind,
      reportStatusRefreshVersion,
    },
    actions: {
      resetChannelsWorkspace,
      setChannels,
      prefetchServersChannels,
      prefetchMessageCachesForServers,
      getDefaultChannelIdForServer,
    },
  };
}
