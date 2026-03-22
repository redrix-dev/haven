import { useState, useEffect, useCallback, useRef } from 'react';
import { getControlPlaneBackend } from '@shared/lib/backend';
import { getErrorMessage } from '@platform/lib/errors';
import { useAuthStore } from '@shared/stores/authStore';
import { useServersStore } from '@shared/stores/serversStore';
import type { ServerSummary } from '@shared/lib/backend/types';

const controlPlaneBackend = getControlPlaneBackend();

type ServersStatus = 'idle' | 'loading' | 'success' | 'error';

type UseServersInput = {
  onActiveServerAccessLost?: (serverId: string) => void;
};

export function useServers({ onActiveServerAccessLost }: UseServersInput = {}) {
  const user = useAuthStore((state) => state.user);
  const [status, setStatus] = useState<ServersStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const servers = useServersStore((state) => state.servers);
  const loading = useServersStore((state) => state.isLoading);
  const lastAccessLostServerIdRef = useRef<string | null>(null);

  const setStoredServers = useCallback((serverList: ServerSummary[]) => {
    useServersStore.getState().setServers(serverList);
  }, []);

  const setStoredCurrentServer = useCallback((currentServer: ServerSummary | null) => {
    useServersStore.getState().setCurrentServer(currentServer);
  }, []);

  const setStoredIsLoading = useCallback((isLoading: boolean) => {
    useServersStore.getState().setIsLoading(isLoading);
  }, []);

  const resetStoredServers = useCallback(() => {
    useServersStore.getState().reset();
  }, []);

  const syncStoredCurrentServer = useCallback((serverList: ServerSummary[]) => {
    const { currentServerId } = useServersStore.getState();
    const nextCurrentServer =
      currentServerId ? serverList.find((server) => server.id === currentServerId) ?? null : null;
    setStoredCurrentServer(nextCurrentServer);
  }, [setStoredCurrentServer]);

  const detectActiveServerAccessLoss = useCallback(
    (serverList: ServerSummary[]) => {
      const { currentServerId } = useServersStore.getState();
      if (!currentServerId) {
        lastAccessLostServerIdRef.current = null;
        return;
      }

      const stillHasAccess = serverList.some((server) => server.id === currentServerId);
      if (stillHasAccess) {
        if (lastAccessLostServerIdRef.current === currentServerId) {
          lastAccessLostServerIdRef.current = null;
        }
        return;
      }

      if (lastAccessLostServerIdRef.current === currentServerId) return;

      lastAccessLostServerIdRef.current = currentServerId;
      onActiveServerAccessLost?.(currentServerId); // CHECKPOINT 1 COMPLETE
    },
    [onActiveServerAccessLost]
  );

  const loadServers = useCallback(async () => {
    if (!user) {
      resetStoredServers();
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('loading');
    setStoredIsLoading(true);
    setError(null);

    try {
      const serverList = await controlPlaneBackend.listUserCommunities(user.id);
      setStoredServers(serverList);
      syncStoredCurrentServer(serverList);
      detectActiveServerAccessLoss(serverList);
      setStatus('success');
    } catch (err: unknown) {
      console.error('Error loading servers:', err);
      setStatus('error');
      setError(getErrorMessage(err, 'Failed to load servers.'));
    } finally {
      setStoredIsLoading(false);
    }
  }, [
    detectActiveServerAccessLoss,
    resetStoredServers,
    setStoredIsLoading,
    setStoredServers,
    syncStoredCurrentServer,
    user,
  ]);

  useEffect(() => {
    if (!user) {
      resetStoredServers();
      setStatus('idle');
      setError(null);
      return;
    }
    void loadServers();

    const subscription = controlPlaneBackend.subscribeToUserCommunities(user.id, () => {
      void loadServers();
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [user, loadServers, resetStoredServers]);

  async function createServer(name: string) {
    if (!user) throw new Error('Not authenticated');
    const community = await controlPlaneBackend.createCommunity(name);
    await loadServers();
    return community;
  }

  return { servers, status, error, loading, createServer, refreshServers: loadServers };
}
