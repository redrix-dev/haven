import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSocialBackend } from "@shared/lib/backend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import { useSocialGraphRealtimeStore } from "@shared/stores/socialGraphRealtimeStore";

const DEFAULT_COUNTS: SocialCounts = {
  friendsCount: 0,
  incomingPendingRequestCount: 0,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 0,
};

export function useFriendsModalData(
  visible: boolean,
  userId: string | null,
  /** Keeps `useSocialWorkspace` / navbar counts aligned after loads and mutations. */
  syncGlobalSocialCounts?: () => Promise<void>,
) {
  const socialBackend = useMemo(() => getSocialBackend(), []);

  const [counts, setCounts] = useState<SocialCounts>(DEFAULT_COUNTS);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const socialGraphRevision = useSocialGraphRealtimeStore((s) => s.revision);
  const lastProcessedSocialGraphRevisionRef = useRef<number | null>(null);

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
        const [nextCounts, nextFriends, nextRequests, nextBlockedUsers] = await Promise.all([
          socialBackend.getSocialCounts(),
          socialBackend.listFriends(),
          socialBackend.listFriendRequests(),
          socialBackend.listBlockedUsers(),
        ]);

        setCounts(nextCounts);
        setFriends(nextFriends);
        setRequests(nextRequests);
        setBlockedUsers(nextBlockedUsers);
        if (syncGlobalSocialCounts) {
          await syncGlobalSocialCounts();
        }
      } catch (error) {
        setLoadError(getErrorMessage(error, "Failed to load friends data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [socialBackend, syncGlobalSocialCounts, userId, visible],
  );

  useEffect(() => {
    if (!visible) {
      lastProcessedSocialGraphRevisionRef.current = null;
      setActionError(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    void refreshData();
  }, [refreshData, visible]);

  useEffect(() => {
    if (!visible || !userId) return;

    if (lastProcessedSocialGraphRevisionRef.current === null) {
      lastProcessedSocialGraphRevisionRef.current = socialGraphRevision;
      return;
    }
    if (lastProcessedSocialGraphRevisionRef.current === socialGraphRevision) {
      return;
    }
    lastProcessedSocialGraphRevisionRef.current = socialGraphRevision;
    void refreshData({ suppressLoadingState: true });
  }, [refreshData, socialGraphRevision, userId, visible]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);

    const timeoutId = setTimeout(() => {
      void socialBackend
        .searchUsersForFriendAdd(trimmed)
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(results);
        })
        .catch((error) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchError(getErrorMessage(error, "Failed to search users."));
          setSearchResults([]);
        })
        .finally(() => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchLoading(false);
        });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, socialBackend, visible]);

  const runMutation = useCallback(
    async (actionKey: string, task: () => Promise<void>, refreshSearch?: boolean) => {
      setBusyActionKey(actionKey);
      setActionError(null);
      setSearchError(null);
      try {
        await task();
        await refreshData({ suppressLoadingState: true });
        if (refreshSearch && searchQuery.trim().length >= 2) {
          const results = await socialBackend.searchUsersForFriendAdd(searchQuery.trim());
          setSearchResults(results);
        }
      } catch (error) {
        const message = getErrorMessage(error, "Failed to complete action.");
        setActionError(message);
        if (refreshSearch) setSearchError(message);
      } finally {
        setBusyActionKey(null);
      }
    },
    [refreshData, searchQuery, socialBackend],
  );

  return {
    counts,
    friends,
    requests,
    blockedUsers,
    loading,
    refreshing,
    loadError,
    actionError,
    busyActionKey,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    refreshData,
    runMutation,
    socialBackend,
  };
}
