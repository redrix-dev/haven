/**
 * useServerOrder — client-side server ordering persisted to localStorage.
 *
 * The order is stored as a JSON array of server IDs keyed per user so that
 * multiple accounts on the same device stay independent.
 *
 * Usage:
 *   const { orderedServers, setOrder, resetOrder } = useServerOrder(userId, servers);
 */
import React from 'react';

function storageKey(userId: string) {
  return `haven:user-${userId}:server-order`;
}

function readOrder(userId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return (parsed as unknown[]).filter((v): v is string => typeof v === 'string');
  } catch {
    return null;
  }
}

function writeOrder(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable in some contexts — fail silently.
  }
}

interface ServerLike {
  id: string;
}

export function useServerOrder<T extends ServerLike>(userId: string | null, servers: T[]) {
  const [savedOrder, setSavedOrder] = React.useState<string[] | null>(() => {
    if (!userId) return null;
    return readOrder(userId);
  });

  // When the user changes (sign in/out), re-read from localStorage.
  React.useEffect(() => {
    if (!userId) {
      setSavedOrder(null);
      return;
    }
    setSavedOrder(readOrder(userId));
  }, [userId]);

  const orderedServers = React.useMemo<T[]>(() => {
    if (!savedOrder || savedOrder.length === 0) return servers;

    const byId = new Map(servers.map((s) => [s.id, s]));
    const ordered: T[] = [];

    // First, servers that appear in savedOrder (in order).
    for (const id of savedOrder) {
      const s = byId.get(id);
      if (s) {
        ordered.push(s);
        byId.delete(id);
      }
    }

    // Then, any new servers not in savedOrder yet (appended at end).
    for (const s of byId.values()) {
      ordered.push(s);
    }

    return ordered;
  }, [servers, savedOrder]);

  const setOrder = React.useCallback(
    (ids: string[]) => {
      setSavedOrder(ids);
      if (userId) writeOrder(userId, ids);
    },
    [userId]
  );

  const resetOrder = React.useCallback(() => {
    setSavedOrder(null);
    if (userId) {
      try {
        window.localStorage.removeItem(storageKey(userId));
      } catch {
        // ignore
      }
    }
  }, [userId]);

  return { orderedServers, setOrder, resetOrder };
}
