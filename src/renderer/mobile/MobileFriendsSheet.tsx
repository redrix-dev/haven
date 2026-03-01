import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, RefreshCcw, UserPlus, Users, MessageCircle, UserMinus, ShieldOff, Search, Loader2, Check, UserX,
} from 'lucide-react';
import { getSocialBackend } from '@/lib/backend';
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

type FriendsTab = 'friends' | 'add' | 'requests' | 'blocked';

type ConfirmState =
  | { kind: 'removeFriend'; friendUserId: string; username: string }
  | { kind: 'blockUser'; userId: string; username: string };

const DEFAULT_COUNTS: SocialCounts = {
  friendsCount: 0,
  incomingPendingRequestCount: 0,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 0,
};

const socialBackend = getSocialBackend();

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

interface MobileFriendsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserDisplayName: string;
  onStartDirectMessage: (friendUserId: string) => void;
  requestedTab?: FriendsTab | null;
  highlightedRequestId?: string | null;
}

export function MobileFriendsSheet({
  open,
  onOpenChange,
  currentUserId,
  onStartDirectMessage,
  requestedTab = null,
  highlightedRequestId = null,
}: MobileFriendsSheetProps) {
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const [counts, setCounts] = useState<SocialCounts>(DEFAULT_COUNTS);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmState | null>(null);
  const searchRequestIdRef = useRef(0);

  const incomingRequests = requests.filter((r) => r.direction === 'incoming');
  const outgoingRequests = requests.filter((r) => r.direction === 'outgoing');

  const refreshData = useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      if (!open || !currentUserId) return;
      if (options?.suppressLoadingState) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);

      try {
        const [nextCounts, nextFriends, nextRequests, nextBlocked] = await Promise.all([
          socialBackend.getSocialCounts(),
          socialBackend.listFriends(),
          socialBackend.listFriendRequests(),
          socialBackend.listBlockedUsers(),
        ]);
        setCounts(nextCounts);
        setFriends(nextFriends);
        setRequests(nextRequests);
        setBlockedUsers(nextBlocked);
      } catch (err) {
        setLoadError(getErrorMessage(err, 'Failed to load friends data.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUserId, open]
  );

  useEffect(() => {
    if (!open) {
      setActionError(null);
      setSearchError(null);
      setSearchLoading(false);
      setPendingConfirm(null);
      return;
    }
    void refreshData();
  }, [open, refreshData]);

  useEffect(() => {
    if (!open || !requestedTab) return;
    setActiveTab(requestedTab);
  }, [open, requestedTab]);

  useEffect(() => {
    if (!open || !currentUserId) return;
    const sub = socialBackend.subscribeToSocialGraph(currentUserId, () => {
      void refreshData({ suppressLoadingState: true });
    });
    return () => { void sub.unsubscribe(); };
  }, [currentUserId, open, refreshData]);

  // Debounced search
  useEffect(() => {
    if (!open || activeTab !== 'add') return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const reqId = ++searchRequestIdRef.current;
    setSearchLoading(true);
    setSearchError(null);
    const timeout = window.setTimeout(() => {
      void socialBackend.searchUsersForFriendAdd(trimmed)
        .then((results) => { if (searchRequestIdRef.current === reqId) setSearchResults(results); })
        .catch((err) => { if (searchRequestIdRef.current === reqId) { setSearchError(getErrorMessage(err, 'Search failed.')); setSearchResults([]); } })
        .finally(() => { if (searchRequestIdRef.current === reqId) setSearchLoading(false); });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [activeTab, open, searchQuery]);

  const runMutation = async (
    key: string,
    task: () => Promise<void>,
    opts?: { refreshSearch?: boolean }
  ) => {
    setBusyActionKey(key);
    setActionError(null);
    setSearchError(null);
    try {
      await task();
      await refreshData({ suppressLoadingState: true });
      if (opts?.refreshSearch && activeTab === 'add' && searchQuery.trim().length >= 2) {
        const results = await socialBackend.searchUsersForFriendAdd(searchQuery.trim());
        setSearchResults(results);
      }
    } catch (err) {
      const msg = getErrorMessage(err, 'Action failed.');
      setActionError(msg);
      if (opts?.refreshSearch) setSearchError(msg);
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleMessageFriend = (friendUserId: string) => {
    onOpenChange(false);
    onStartDirectMessage(friendUserId);
  };

  const confirmPendingAction = () => {
    if (!pendingConfirm) return;
    const next = pendingConfirm;
    setPendingConfirm(null);
    if (next.kind === 'removeFriend') {
      void runMutation(`remove-friend:${next.friendUserId}`, () => socialBackend.removeFriend(next.friendUserId));
    } else {
      void runMutation(`block-user:${next.userId}`, () => socialBackend.blockUser(next.userId));
    }
  };

  if (!open) return null;

  const busy = (key: string) => busyActionKey === key;

  // ── Tab definitions ──────────────────────────────────────────────────────
  const tabs: { id: FriendsTab; label: string; badge?: number }[] = [
    { id: 'friends', label: 'Friends', badge: counts.friendsCount },
    { id: 'add', label: 'Add' },
    { id: 'requests', label: 'Requests', badge: counts.incomingPendingRequestCount },
    { id: 'blocked', label: 'Blocked' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 touch-none overscroll-none" onClick={() => onOpenChange(false)} />

      {/* Sheet */}
      <div className="mobile-bottom-sheet fixed inset-x-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10 flex flex-col" style={{ height: '92dvh' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#9ac0ff]" />
            <h2 className="text-base font-semibold text-white">Friends</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refreshData({ suppressLoadingState: true })}
              disabled={refreshing || loading}
              className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 transition-colors"
            >
              <RefreshCcw className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-1 shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none ${
                  tab.id === 'requests' ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-300'
                }`}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {(loadError || actionError) && (
          <div className="mx-4 mt-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 shrink-0">
            <p className="text-sm text-red-300">{actionError ?? loadError}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          )}

          {/* ── Friends tab ─────────────────────────────────────────────── */}
          {!loading && activeTab === 'friends' && (
            <>
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Users className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 text-sm">No friends yet.</p>
                  <button
                    onClick={() => setActiveTab('add')}
                    className="mt-1 flex items-center gap-1.5 text-blue-400 text-sm hover:text-blue-300"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add a friend
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.friendUserId}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/5"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                        {friend.avatarUrl ? (
                          <img src={friend.avatarUrl} alt={friend.username} className="w-full h-full object-cover" />
                        ) : initial(friend.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{friend.username}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleMessageFriend(friend.friendUserId)}
                          className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4 text-blue-300" />
                        </button>
                        <button
                          onClick={() => setPendingConfirm({ kind: 'removeFriend', friendUserId: friend.friendUserId, username: friend.username })}
                          disabled={busy(`remove-friend:${friend.friendUserId}`)}
                          className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 transition-colors"
                        >
                          {busy(`remove-friend:${friend.friendUserId}`) ? (
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                          ) : (
                            <UserMinus className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Add Friend tab ──────────────────────────────────────────── */}
          {!loading && activeTab === 'add' && (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                  autoFocus
                />
              </div>

              {searchLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
              )}

              {searchError && (
                <p className="text-sm text-red-400 text-center py-4">{searchError}</p>
              )}

              {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
                <p className="text-sm text-gray-500 text-center py-6">No users found.</p>
              )}

              {searchQuery.trim().length < 2 && !searchLoading && (
                <p className="text-xs text-gray-600 text-center py-6">Type at least 2 characters to search.</p>
              )}

              <div className="space-y-2">
                {searchResults.map((result) => {
                  const reqKey = `send-request:${result.username.toLowerCase()}`;
                  return (
                    <div
                      key={result.userId}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/5"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                        {result.avatarUrl ? (
                          <img src={result.avatarUrl} alt={result.username} className="w-full h-full object-cover" />
                        ) : initial(result.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{result.username}</p>
                        {result.relationshipStatus !== 'none' && (
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{result.relationshipStatus.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                      {result.relationshipStatus === 'none' && (
                        <button
                          onClick={() => void runMutation(reqKey, () => socialBackend.sendFriendRequest(result.username), { refreshSearch: true })}
                          disabled={busy(reqKey)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-60"
                        >
                          {busy(reqKey) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                          Add
                        </button>
                      )}
                      {result.relationshipStatus === 'request_sent' && (
                        <span className="text-xs text-gray-500 px-2">Sent</span>
                      )}
                      {result.relationshipStatus === 'friends' && (
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Requests tab ────────────────────────────────────────────── */}
          {!loading && activeTab === 'requests' && (
            <>
              {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <UserPlus className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 text-sm">No pending requests.</p>
                </div>
              )}

              {incomingRequests.length > 0 && (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                    Incoming ({incomingRequests.length})
                  </p>
                  <div className="space-y-2 mb-5">
                    {incomingRequests.map((req) => {
                      const highlighted = req.requestId === highlightedRequestId;
                      return (
                        <div
                          key={req.requestId}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border ${
                            highlighted
                              ? 'bg-blue-600/10 border-blue-500/30'
                              : 'bg-white/3 border-white/5'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                            {req.avatarUrl ? (
                              <img src={req.avatarUrl} alt={req.username} className="w-full h-full object-cover" />
                            ) : initial(req.username)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{req.username}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => void runMutation(`accept-request:${req.requestId}`, () => socialBackend.acceptFriendRequest(req.requestId))}
                              disabled={busy(`accept-request:${req.requestId}`)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-60"
                            >
                              {busy(`accept-request:${req.requestId}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Accept
                            </button>
                            <button
                              onClick={() => void runMutation(`decline-request:${req.requestId}`, () => socialBackend.declineFriendRequest(req.requestId))}
                              disabled={busy(`decline-request:${req.requestId}`)}
                              className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 transition-colors"
                            >
                              {busy(`decline-request:${req.requestId}`) ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" /> : <X className="w-3.5 h-3.5 text-gray-500" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {outgoingRequests.length > 0 && (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                    Sent ({outgoingRequests.length})
                  </p>
                  <div className="space-y-2">
                    {outgoingRequests.map((req) => (
                      <div
                        key={req.requestId}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/5"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                          {req.avatarUrl ? (
                            <img src={req.avatarUrl} alt={req.username} className="w-full h-full object-cover" />
                          ) : initial(req.username)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{req.username}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Pending</p>
                        </div>
                        <button
                          onClick={() => void runMutation(`cancel-request:${req.requestId}`, () => socialBackend.cancelFriendRequest(req.requestId))}
                          disabled={busy(`cancel-request:${req.requestId}`)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors disabled:opacity-60"
                        >
                          {busy(`cancel-request:${req.requestId}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Blocked tab ─────────────────────────────────────────────── */}
          {!loading && activeTab === 'blocked' && (
            <>
              {blockedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <ShieldOff className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 text-sm">No blocked users.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((blocked) => (
                    <div
                      key={blocked.blockedUserId}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/5"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                        {blocked.avatarUrl ? (
                          <img src={blocked.avatarUrl} alt={blocked.username} className="w-full h-full object-cover" />
                        ) : initial(blocked.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-400 truncate">{blocked.username}</p>
                      </div>
                      <button
                        onClick={() => void runMutation(`unblock-user:${blocked.blockedUserId}`, () => socialBackend.unblockUser(blocked.blockedUserId))}
                        disabled={busy(`unblock-user:${blocked.blockedUserId}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors disabled:opacity-60"
                      >
                        {busy(`unblock-user:${blocked.blockedUserId}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm action sheet */}
      {pendingConfirm && (
        <>
          <div className="fixed inset-0 z-60 bg-black/70 touch-none overscroll-none" onClick={() => setPendingConfirm(null)} />
          <div className="mobile-bottom-card fixed inset-x-4 z-70 rounded-2xl bg-[#18243a] border border-white/10 p-5">
            <p className="text-white font-semibold text-center mb-1">
              {pendingConfirm.kind === 'removeFriend' ? 'Remove friend?' : 'Block user?'}
            </p>
            <p className="text-gray-400 text-sm text-center mb-5">
              {pendingConfirm.kind === 'removeFriend'
                ? `Remove ${pendingConfirm.username} from your friends list?`
                : `Block ${pendingConfirm.username}? They won't be able to message you.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPendingAction}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors text-white ${
                  pendingConfirm.kind === 'blockUser'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-[#304867] hover:bg-[#3a5a7e]'
                }`}
              >
                {pendingConfirm.kind === 'removeFriend' ? 'Remove' : 'Block'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
