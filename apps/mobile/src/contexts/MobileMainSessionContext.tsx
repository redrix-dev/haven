import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { dataCacheDebug, useDataCacheComponentProbe } from "@shared/debug";
import { applyCommunityNavigationTarget } from "@shared/features/community/communityNavigation";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useServers } from "@shared/features/community/hooks/useServers";
import { prefetchCommunityChannelMessages } from "@shared/features/messaging/hooks/useMessages";
import { useServersStore } from "@shared/stores/serversStore";
import { getLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";

type CommunityWorkspaceReturn = ReturnType<typeof useCommunityWorkspace>;
type ServersReturn = Pick<
  ReturnType<typeof useServers>,
  "servers" | "status" | "error" | "loading" | "refreshServers" | "createServer"
>;

type MobileMainSessionContextValue = {
  servers: ServersReturn["servers"];
  serversStatus: ServersReturn["status"];
  serversError: ServersReturn["error"];
  serversLoading: ServersReturn["loading"];
  refreshServers: ServersReturn["refreshServers"];
  createServer: ServersReturn["createServer"];
  communityWorkspace: CommunityWorkspaceReturn;
  /** Prefetch channel list + last visited channel messages before navigation. */
  warmCommunityForEntry: (serverId: string) => Promise<void>;
};

const MobileMainSessionContext = createContext<MobileMainSessionContextValue | null>(
  null,
);

export function MobileMainSessionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { servers, status, error, loading, refreshServers, createServer } = useServers();
  const communityWorkspace = useCommunityWorkspace({
    servers,
    currentUserId: userId,
    autoSelectFirstServer: false,
  });

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
          currentUserId: userId,
        });
      }

      applyCommunityNavigationTarget(serverId, { lastVisitedChannelId: lastVisited });

      dataCacheDebug.lifecycle("MobileMainSession", "warmCommunityForEntry complete", {
        serverId,
        channelId,
      });
    },
    [communityWorkspace.actions, userId],
  );

  const navServerId = useNavigationStore((s) => s.currentServerId);
  const navChannelId = useNavigationStore((s) => s.currentChannelId);

  useDataCacheComponentProbe("MobileMainSession", {
    navServerId,
    navChannelId,
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

/** Read servers list without requiring the full session hook surface. */
export function useMobileServersFromSession() {
  const { servers, serversStatus, serversError, refreshServers } =
    useMobileMainSession();
  const loading = useServersStore((state) => state.isLoading);
  return { servers, status: serversStatus, error: serversError, loading, refreshServers };
}
