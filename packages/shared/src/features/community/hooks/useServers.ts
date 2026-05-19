import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireHavenCore, useHavenCore } from "@shared/core";
import { notifyActiveServerAccessLost } from "@shared/core/communityAccessHandlers";
import { useAuthStore } from "@shared/stores/authStore";
import type { ServerSummary } from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import type { Community } from "@shared/nexus/community/CommunityNexus";

type ServersStatus = "idle" | "loading" | "success" | "error";

type UseServersInput = {
  onActiveServerAccessLost?: (serverId: string) => void;
};

const toServerSummary = (community: Community): ServerSummary => ({
  id: community.id,
  name: community.name,
  created_at: community.createdAt,
});

/**
 * Thin nexus reader. Domain data lives in CommunityNexus; this hook only:
 *   1. exposes the list as `ServerSummary[]` for legacy consumers
 *   2. wraps create/refresh actions
 *   3. notifies callers when the active community disappears (moderation/access)
 *
 */
export function useServers({
  onActiveServerAccessLost = notifyActiveServerAccessLost,
}: UseServersInput = {}) {
  const core = useHavenCore();
  const user = useAuthStore((state) => state.user);
  const nexusCommunities = core.communities.useCommunities();
  const nexusLoading = core.communities.useIsLoading();

  const servers = useMemo(
    () => nexusCommunities.map(toServerSummary),
    [nexusCommunities],
  );

  const [status, setStatus] = useState<ServersStatus>(() =>
    nexusCommunities.length > 0 ? "success" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const lastAccessLostServerIdRef = useRef<string | null>(null);

  // Surface access-loss events when the active community disappears from the list.
  useEffect(() => {
    const currentServerId = core.communities.getActiveId();
    if (!currentServerId) {
      lastAccessLostServerIdRef.current = null;
      return;
    }
    const stillHasAccess = servers.some(
      (server) => server.id === currentServerId,
    );
    if (stillHasAccess) {
      if (lastAccessLostServerIdRef.current === currentServerId) {
        lastAccessLostServerIdRef.current = null;
      }
      return;
    }
    if (lastAccessLostServerIdRef.current === currentServerId) return;
    lastAccessLostServerIdRef.current = currentServerId;
    onActiveServerAccessLost?.(currentServerId);
  }, [core, servers, onActiveServerAccessLost]);

  // Surface status from nexus state.
  useEffect(() => {
    if (!user) {
      setStatus("idle");
      setError(null);
      return;
    }
    if (nexusLoading) {
      setStatus("loading");
      return;
    }
    setStatus(nexusCommunities.length > 0 ? "success" : "idle");
  }, [user, nexusLoading, nexusCommunities.length]);

  const refreshServers = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      await core.communities.load(user.id);
    } catch (err: unknown) {
      console.error("Error loading servers:", err);
      setStatus("error");
      setError(getErrorMessage(err, "Failed to load servers."));
    }
  }, [core, user]);

  const createServer = useCallback(
    async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const community = await requireHavenCore().backends.controlPlane.createCommunity(name);
      await refreshServers();
      return community;
    },
    [user, refreshServers],
  );

  return {
    servers,
    status,
    error,
    loading: nexusLoading,
    createServer,
    refreshServers,
  };
}
