import { useCallback, useEffect, useMemo, useState } from "react";
import { getSocialBackend } from "@shared/lib/backend";
import type { FriendSearchResult } from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore } from "@shared/core";

export function useFriendsModalData(visible: boolean, userId: string | null) {
  const core = useHavenCore();
  const socialBackend = useMemo(() => getSocialBackend(), []);

  const counts = core.social.useCounts();
  const friends = core.social.useFriends();
  const requests = core.social.useRequests();
  const blockedUsers = core.social.useBlockedUsers();
  const nexusLoading = core.social.useIsLoading();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const refreshData = useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      if (!visible || !userId) return;

      if (options?.suppressLoadingState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);

      try {
        await core.social.load();
      } catch (error) {
        setLoadError(getErrorMessage(error, "Failed to load friends data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [core.social, userId, visible],
  );

  useEffect(() => {
    if (!visible) {
      setActionError(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    void refreshData();
  }, [refreshData, visible]);

  useEffect(() => {
    if (!visible) return;
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    void socialBackend
      .searchUsersForFriendAdd(query)
      .then((results) => {
        if (cancelled) return;
        setSearchResults(results);
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchError(getErrorMessage(error, "Search failed."));
        setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, socialBackend, visible]);

  const runMutation = useCallback(
    async (actionKey: string, fn: () => Promise<void>) => {
      setBusyActionKey(actionKey);
      setActionError(null);
      try {
        await fn();
        await core.social.load();
      } catch (error) {
        setActionError(getErrorMessage(error, "Action failed."));
      } finally {
        setBusyActionKey(null);
      }
    },
    [core.social],
  );

  return {
    counts,
    friends,
    requests,
    blockedUsers,
    loading: loading || nexusLoading,
    refreshing,
    loadError,
    actionError,
    busyActionKey,
    setActionError,
    setBusyActionKey,
    refreshData,
    runMutation,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    socialBackend,
    core,
  };
}
