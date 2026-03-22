import { useState, useEffect, useCallback } from 'react';
import { getControlPlaneBackend } from '@shared/lib/backend';
import { getErrorMessage } from '@platform/lib/errors';
import { useAuthStore } from '@shared/stores/authStore';
import { useServersStore } from '@shared/stores/serversStore';
import type { ServerSummary } from '@shared/lib/backend/types';

const controlPlaneBackend = getControlPlaneBackend();

type ServersStatus = 'idle' | 'loading' | 'success' | 'error';

export function useServers() {
  const user = useAuthStore((state) => state.user);
  const [status, setStatus] = useState<ServersStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const servers = useServersStore((state) => state.servers);
  const loading = useServersStore((state) => state.isLoading);

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
      setStatus('success');
    } catch (err: unknown) {
      console.error('Error loading servers:', err);
      setStatus('error');
      setError(getErrorMessage(err, 'Failed to load servers.'));
    } finally {
      setStoredIsLoading(false);
    }
  }, [resetStoredServers, setStoredIsLoading, setStoredServers, syncStoredCurrentServer, user]);

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
