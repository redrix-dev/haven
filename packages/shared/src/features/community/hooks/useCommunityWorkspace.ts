import React from "react";
import { getCommunityDataBackend } from "@shared/lib/backend";
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

type UseCommunityWorkspaceInput = {
  servers: ServerSummary[];
  currentUserId: string | null;
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
  onMemberBanned,
  onMemberChannelAccessRevoked,
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

  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = React.useState(false);
  const [channelsError, setChannelsError] = React.useState<string | null>(null);
  const [reportStatusRefreshVersion, setReportStatusRefreshVersion] =
    React.useState(0);

  const channelsByServerCacheRef = React.useRef<Record<string, Channel[]>>({});
  const lastSelectedChannelIdByServerRef = React.useRef<
    Record<string, string | null>
  >({});

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
                channelsByServerCacheRef.current,
                id,
              ),
          )
          .map(async (id) => {
            try {
              const communityBackend = getCommunityDataBackend(id);
              const channelList = await communityBackend.listChannels(id);
              channelsByServerCacheRef.current[id] = channelList;
            } catch {
              // silent — prefetch failures are non-fatal
            }
          }),
      );
    },
    [],
  );

  const getDefaultChannelIdForServer = React.useCallback(
    (serverId: string, lastVisitedChannelId?: string | null): string | null => {
      const cached = channelsByServerCacheRef.current[serverId];
      if (!cached || cached.length === 0) return null;
      const rememberedId =
        lastSelectedChannelIdByServerRef.current[serverId] ?? null;
      const candidates = [lastVisitedChannelId ?? null, rememberedId];
      for (const candidate of candidates) {
        if (candidate && cached.some((c) => c.id === candidate))
          return candidate;
      }
      return cached.find((c) => c.kind === "text")?.id ?? cached[0]?.id ?? null;
    },
    [],
  );

  // Auto-select first server if none selected
  React.useEffect(() => {
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [servers, currentServerId, setCurrentServerId]);

  // Remember last selected channel per server
  React.useEffect(() => {
    if (!currentServerId) return;
    if (!currentChannelId) return;
    lastSelectedChannelIdByServerRef.current[currentServerId] =
      currentChannelId;
  }, [currentServerId, currentChannelId]);

  // Load channels when server changes
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
      currentServerId,
    );
    const cachedChannels = hasCachedChannels
      ? (channelsByServerCacheRef.current[currentServerId] ?? [])
      : null;

    const resolvePreferredChannelId = (
      channelList: Channel[],
      previousChannelId: string | null,
    ) => {
      if (channelList.length === 0) return null;

      const rememberedChannelId =
        lastSelectedChannelIdByServerRef.current[currentServerId] ?? null;
      const candidates = [rememberedChannelId, previousChannelId];
      for (const candidate of candidates) {
        if (
          candidate &&
          channelList.some((channel) => channel.id === candidate)
        ) {
          return candidate;
        }
      }

      const firstTextChannel = channelList.find(
        (channel) => channel.kind === "text",
      );
      return firstTextChannel?.id ?? channelList[0].id;
    };

    if (cachedChannels) {
      setChannels(cachedChannels);
      setChannelsError(null);
      setChannelsLoading(false);
      setCurrentChannelId(
        resolvePreferredChannelId(cachedChannels, currentChannelId),
      );
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

        channelsByServerCacheRef.current[currentServerId] = channelList;
        setChannels(channelList);
        const nextChannelId = resolvePreferredChannelId(
          channelList,
          currentChannelId,
        );
        setCurrentChannelId(nextChannelId);
      } catch (error: unknown) {
        if (!isMounted) return;
        console.error("Error loading channels:", error);
        if (!hasCachedChannels) {
          setChannels([]);
          setCurrentChannelId(null);
        }
        setChannelsError(getErrorMessage(error, "Failed to load channels."));
      }

      setChannelsLoading(false);
    };

    void loadChannels({ blocking: !hasCachedChannels });

    const subscription = communityBackend.subscribeToChannels(
      currentServerId,
      () => {
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
  ]);

  // Load permissions when server or user changes
  React.useEffect(() => {
    let isMounted = true;

    if (!currentUserId || !currentServerId) {
      if (currentServerId) {
        usePermissionsStore.getState().clearPermissions(currentServerId);
      }
      return () => {
        isMounted = false;
      };
    }

    const loadPermissions = async () => {
      try {
        const communityBackend = getCommunityDataBackend(currentServerId);
        const fetchedPermissions =
          await communityBackend.fetchServerPermissions(currentServerId);

        if (!isMounted) return;
        usePermissionsStore
          .getState()
          .setPermissions(currentServerId, fetchedPermissions);
      } catch (error) {
        console.error("Error loading server permissions:", error);
        if (!isMounted) return;
        usePermissionsStore.getState().clearPermissions(currentServerId);
      }
    };

    void loadPermissions();

    return () => {
      isMounted = false;
    };
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
      getDefaultChannelIdForServer,
    },
  };
}
