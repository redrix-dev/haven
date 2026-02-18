import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getControlPlaneBackend } from '@/lib/backend';
import { getErrorMessage } from '@/shared/lib/errors';
import type { ServerSummary } from '@/lib/backend/types';

const controlPlaneBackend = getControlPlaneBackend();

type ServersStatus = 'idle' | 'loading' | 'success' | 'error';

export function useServers() {
  const { user } = useAuth();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [status, setStatus] = useState<ServersStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const loading = status === 'loading';

  const loadServers = useCallback(async () => {
    if (!user) {
      setServers([]);
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const serverList = await controlPlaneBackend.listUserCommunities(user.id);
      setServers(serverList);
      setStatus('success');
    } catch (err: unknown) {
      console.error('Error loading servers:', err);
      setStatus('error');
      setError(getErrorMessage(err, 'Failed to load servers.'));
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setServers([]);
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
  }, [user, loadServers]);

  async function createServer(name: string) {
    if (!user) throw new Error('Not authenticated');
    const community = await controlPlaneBackend.createCommunity(name);
    await loadServers();
    return community;
  }

  return { servers, status, error, loading, createServer, refreshServers: loadServers };
}
