import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSocialBackend } from '@/lib/backend';
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { RefreshCcw, UserPlus, Users } from 'lucide-react';

type FriendsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserDisplayName: string;
  onStartDirectMessage: (friendUserId: string) => void;
  requestedTab?: FriendsTab | null;
  highlightedRequestId?: string | null;
};

type FriendsTab = 'friends' | 'add' | 'requests' | 'blocked';
type FriendsConfirmState =
  | { kind: 'removeFriend'; friendUserId: string; username: string }
  | { kind: 'blockUser'; userId: string; username: string };

const socialBackend = getSocialBackend();

const DEFAULT_SOCIAL_COUNTS: SocialCounts = {
  friendsCount: 0,
  incomingPendingRequestCount: 0,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 0,
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
};

const formatMutuals = (count: number, names: string[]) => {
  if (count <= 0) return 'No mutual servers';
  if (names.length === 0) return `${count} mutual server${count === 1 ? '' : 's'}`;
  const suffix = count > names.length ? ` (+${count - names.length} more)` : '';
  return `${names.join(', ')}${suffix}`;
};

const renderAvatarInitial = (value: string) => value.trim().charAt(0).toUpperCase() || 'U';

export function FriendsModal({
  open,
  onOpenChange,
  currentUserId,
  currentUserDisplayName,
  onStartDirectMessage,
  requestedTab = null,
  highlightedRequestId = null,
}: FriendsModalProps) {
  const [activeTab, setActiveTab] = React.useState<FriendsTab>('friends');
  const [counts, setCounts] = React.useState<SocialCounts>(DEFAULT_SOCIAL_COUNTS);
  const [friends, setFriends] = React.useState<FriendSummary[]>([]);
  const [requests, setRequests] = React.useState<FriendRequestSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<FriendSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = React.useState<FriendsConfirmState | null>(null);
  const searchRequestIdRef = React.useRef(0);

  const incomingRequests = requests.filter((request) => request.direction === 'incoming');
  const outgoingRequests = requests.filter((request) => request.direction === 'outgoing');

  const refreshData = React.useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      if (!open || !currentUserId) return;

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
      } catch (error) {
        setLoadError(getErrorMessage(error, 'Failed to load friends data.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUserId, open]
  );

  React.useEffect(() => {
    if (!open) {
      setActionError(null);
      setSearchError(null);
      setSearchLoading(false);
      setPendingConfirm(null);
      return;
    }

    void refreshData();
  }, [open, refreshData]);

  React.useEffect(() => {
    if (!open || !requestedTab) return;
    setActiveTab(requestedTab);
  }, [open, requestedTab]);

  React.useEffect(() => {
    if (!open || !currentUserId) return;

    const subscription = socialBackend.subscribeToSocialGraph(currentUserId, () => {
      void refreshData({ suppressLoadingState: true });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [currentUserId, open, refreshData]);

  React.useEffect(() => {
    if (!open || activeTab !== 'add') return;

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(() => {
      void socialBackend
        .searchUsersForFriendAdd(trimmedQuery)
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(results);
        })
        .catch((error) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchError(getErrorMessage(error, 'Failed to search users.'));
          setSearchResults([]);
        })
        .finally(() => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchLoading(false);
        });
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, open, searchQuery]);

  const runMutation = async (
    actionKey: string,
    task: () => Promise<void>,
    options?: { refreshSearch?: boolean }
  ) => {
    setBusyActionKey(actionKey);
    setActionError(null);
    setSearchError(null);
    try {
      await task();
      await refreshData({ suppressLoadingState: true });
      if (options?.refreshSearch && activeTab === 'add' && searchQuery.trim().length >= 2) {
        const results = await socialBackend.searchUsersForFriendAdd(searchQuery.trim());
        setSearchResults(results);
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to complete action.');
      setActionError(message);
      if (options?.refreshSearch) {
        setSearchError(message);
      }
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleSendFriendRequest = (username: string) =>
    runMutation(
      `send-request:${username.toLowerCase()}`,
      async () => {
        await socialBackend.sendFriendRequest(username);
      },
      { refreshSearch: true }
    );

  const handleAcceptRequest = (requestId: string) =>
    runMutation(`accept-request:${requestId}`, async () => {
      await socialBackend.acceptFriendRequest(requestId);
    });

  const handleDeclineRequest = (requestId: string) =>
    runMutation(`decline-request:${requestId}`, async () => {
      await socialBackend.declineFriendRequest(requestId);
    });

  const handleCancelRequest = (requestId: string) =>
    runMutation(`cancel-request:${requestId}`, async () => {
      await socialBackend.cancelFriendRequest(requestId);
    });

  const handleRemoveFriend = (friend: FriendSummary) => {
    setPendingConfirm({
      kind: 'removeFriend',
      friendUserId: friend.friendUserId,
      username: friend.username,
    });
  };

  const handleBlockUser = (input: { userId: string; username: string }) => {
    setPendingConfirm({
      kind: 'blockUser',
      userId: input.userId,
      username: input.username,
    });
  };

  const confirmPendingAction = () => {
    if (!pendingConfirm) return;
    const nextConfirm = pendingConfirm;
    setPendingConfirm(null);

    if (nextConfirm.kind === 'removeFriend') {
      void runMutation(`remove-friend:${nextConfirm.friendUserId}`, async () => {
        await socialBackend.removeFriend(nextConfirm.friendUserId);
      });
      return;
    }

    void runMutation(`block-user:${nextConfirm.userId}`, async () => {
      await socialBackend.blockUser(nextConfirm.userId);
    });
  };

  const handleUnblockUser = (blockedUserId: string) =>
    runMutation(`unblock-user:${blockedUserId}`, async () => {
      await socialBackend.unblockUser(blockedUserId);
    });

  const handleMessageFriend = (friendUserId: string) => {
    onOpenChange(false);
    onStartDirectMessage(friendUserId);
  };

  const renderPersonRow = (input: {
    id: string;
    username: string;
    avatarUrl: string | null;
    subtitle?: string | null;
    badges?: React.ReactNode;
    actions?: React.ReactNode;
    highlighted?: boolean;
  }) => (
    <div
      key={input.id}
      className={`rounded-md border px-3 py-3 ${
        input.highlighted
          ? 'border-[#5b92e8] bg-[#13233c] ring-1 ring-[#5b92e8]/50'
          : 'border-[#304867] bg-[#142033]'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-10 rounded-xl border border-[#304867] bg-[#1b2a42]">
          {input.avatarUrl && <AvatarImage src={input.avatarUrl} alt={input.username} />}
          <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
            {renderAvatarInitial(input.username)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white break-all">{input.username}</p>
            {input.badges}
          </div>
          {input.subtitle && <p className="mt-1 text-xs text-[#a9b8cf]">{input.subtitle}</p>}
          {input.actions && <div className="mt-2 flex flex-wrap items-center gap-2">{input.actions}</div>}
        </div>
      </div>
    </div>
  );

  const pendingConfirmActionKey =
    pendingConfirm?.kind === 'removeFriend'
      ? `remove-friend:${pendingConfirm.friendUserId}`
      : pendingConfirm
        ? `block-user:${pendingConfirm.userId}`
        : null;
  const pendingConfirmBusy = pendingConfirmActionKey !== null && busyActionKey === pendingConfirmActionKey;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="app" className="border-[#304867] bg-[#111a2b] text-white p-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-[#263a58] bg-[linear-gradient(135deg,#16233a_0%,#101a2b_70%,#111a2b_100%)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Users className="size-5 text-[#9ac0ff]" />
                  Friends
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  Manage friends, requests, and blocked users before starting direct messages.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  {currentUserDisplayName}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void refreshData({ suppressLoadingState: true });
                  }}
                  disabled={refreshing || loading}
                  className="border-[#304867] text-white"
                >
                  <RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 p-4">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FriendsTab)} className="h-full min-h-0">
              <TabsList className="bg-[#18243a] border border-[#304867]">
                <TabsTrigger value="friends" className="data-[state=active]:bg-[#22334f]">
                  Friends
                  <Badge variant="outline" className="ml-1 border-[#304867] text-[#cfe0ff]">
                    {counts.friendsCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="add" className="data-[state=active]:bg-[#22334f]">
                  Add Friend
                </TabsTrigger>
                <TabsTrigger value="requests" className="data-[state=active]:bg-[#22334f]">
                  Requests
                  <Badge
                    variant="outline"
                    className={`ml-1 border-[#304867] ${
                      counts.incomingPendingRequestCount > 0 ? 'text-[#ffd9d9]' : 'text-[#cfe0ff]'
                    }`}
                  >
                    {counts.incomingPendingRequestCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="blocked" className="data-[state=active]:bg-[#22334f]">
                  Blocked
                  <Badge variant="outline" className="ml-1 border-[#304867] text-[#cfe0ff]">
                    {counts.blockedUserCount}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {(loadError || actionError) && (
                <div className="mt-3 rounded-md border border-[#5a2d3d] bg-[#2a1821] px-3 py-2 text-sm text-[#ffd4df]">
                  {actionError ?? loadError}
                </div>
              )}

              <TabsContent value="friends" className="mt-3 min-h-0">
                <div className="rounded-md border border-[#304867] bg-[#142033]">
                  <div className="px-3 py-2 border-b border-[#263a58] text-xs text-[#a9b8cf] uppercase tracking-wide">
                    Friends ({friends.length})
                  </div>
                  <ScrollArea className="h-[52dvh] xl:h-[56dvh]">
                    <div className="p-3 space-y-2">
                      {loading ? (
                        <p className="text-sm text-[#a9b8cf]">Loading friends...</p>
                      ) : friends.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#304867] bg-[#111a2b]/60 p-4">
                          <p className="text-sm text-[#a9b8cf]">No friends yet.</p>
                          <p className="mt-1 text-xs text-[#90a5c4]">
                            Use the Add Friend tab to search by exact username.
                          </p>
                        </div>
                      ) : (
                        friends.map((friend) =>
                          renderPersonRow({
                            id: `friend:${friend.friendUserId}`,
                            username: friend.username,
                            avatarUrl: friend.avatarUrl,
                            subtitle: `${formatMutuals(
                              friend.mutualCommunityCount,
                              friend.mutualCommunityNames
                            )} · Friends since ${formatTimestamp(friend.friendshipCreatedAt)}`,
                            actions: (
                              <>
                                <Button type="button" size="sm" onClick={() => handleMessageFriend(friend.friendUserId)}>
                                  Message
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleRemoveFriend(friend)}
                                  disabled={busyActionKey === `remove-friend:${friend.friendUserId}`}
                                >
                                  Remove
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-[#f3b3b3] hover:text-[#ffd2d2] hover:bg-[#3b2535]"
                                  onClick={() =>
                                    handleBlockUser({
                                      userId: friend.friendUserId,
                                      username: friend.username,
                                    })
                                  }
                                  disabled={busyActionKey === `block-user:${friend.friendUserId}`}
                                >
                                  Block
                                </Button>
                              </>
                            ),
                          })
                        )
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="add" className="mt-3 min-h-0">
                <div className="rounded-md border border-[#304867] bg-[#142033] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Enter exact username"
                      className="bg-[#111a2b] border-[#304867] text-white placeholder:text-[#89a1c3]"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#304867] text-white"
                      onClick={() => {
                        if (searchQuery.trim().length < 2) return;
                        searchRequestIdRef.current += 1;
                        setSearchLoading(true);
                        setSearchError(null);
                        void socialBackend
                          .searchUsersForFriendAdd(searchQuery.trim())
                          .then((results) => {
                            setSearchResults(results);
                          })
                          .catch((error) => {
                            setSearchError(getErrorMessage(error, 'Failed to search users.'));
                            setSearchResults([]);
                          })
                          .finally(() => {
                            setSearchLoading(false);
                          });
                      }}
                      disabled={searchLoading || searchQuery.trim().length < 2}
                    >
                      Search
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-[#9fb2cf]">
                    Search is exact username match (case-insensitive) and debounced by 150ms.
                  </p>
                  {searchError && <p className="mt-2 text-sm text-red-300">{searchError}</p>}
                </div>

                <div className="mt-3 rounded-md border border-[#304867] bg-[#142033]">
                  <div className="px-3 py-2 border-b border-[#263a58] text-xs text-[#a9b8cf] uppercase tracking-wide">
                    Search Results
                  </div>
                  <ScrollArea className="h-[44dvh] xl:h-[48dvh]">
                    <div className="p-3 space-y-2">
                      {searchLoading ? (
                        <p className="text-sm text-[#a9b8cf]">Searching...</p>
                      ) : searchQuery.trim().length < 2 ? (
                        <p className="text-sm text-[#a9b8cf]">Type at least 2 characters to search.</p>
                      ) : searchResults.length === 0 ? (
                        <p className="text-sm text-[#a9b8cf]">No matching users found.</p>
                      ) : (
                        searchResults.map((result) => {
                          const busyKey = `send-request:${result.username.toLowerCase()}`;
                          const pendingRequestId = result.pendingRequestId;
                          const relationshipBadge = (() => {
                            switch (result.relationshipState) {
                              case 'friend':
                                return (
                                  <Badge variant="outline" className="border-[#304867] text-[#cfe0ff]">
                                    Friend
                                  </Badge>
                                );
                              case 'incoming_pending':
                                return (
                                  <Badge variant="outline" className="border-[#587aa8] text-[#d5e6ff]">
                                    Incoming request
                                  </Badge>
                                );
                              case 'outgoing_pending':
                                return (
                                  <Badge variant="outline" className="border-[#587aa8] text-[#d5e6ff]">
                                    Request sent
                                  </Badge>
                                );
                              default:
                                return null;
                            }
                          })();

                          const actions =
                            result.relationshipState === 'none' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void handleSendFriendRequest(result.username);
                                }}
                                disabled={busyActionKey === busyKey}
                              >
                                <UserPlus className="size-4" />
                                Send Friend Request
                              </Button>
                            ) : result.relationshipState === 'incoming_pending' && pendingRequestId ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    void handleAcceptRequest(pendingRequestId);
                                  }}
                                  disabled={busyActionKey === `accept-request:${pendingRequestId}`}
                                >
                                  Accept
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void handleDeclineRequest(pendingRequestId);
                                  }}
                                  disabled={busyActionKey === `decline-request:${pendingRequestId}`}
                                >
                                  Decline
                                </Button>
                              </>
                            ) : (
                              <Button type="button" size="sm" variant="secondary" disabled>
                                {result.relationshipState === 'friend' ? 'Already Friends' : 'Pending'}
                              </Button>
                            );

                          return renderPersonRow({
                            id: `search:${result.userId}`,
                            username: result.username,
                            avatarUrl: result.avatarUrl,
                            subtitle: formatMutuals(result.mutualCommunityCount, result.mutualCommunityNames),
                            badges: relationshipBadge,
                            actions,
                          });
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="requests" className="mt-3 min-h-0">
                <div className="grid min-h-0 grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#304867] bg-[#142033]">
                    <div className="px-3 py-2 border-b border-[#263a58] text-xs text-[#a9b8cf] uppercase tracking-wide">
                      Incoming ({incomingRequests.length})
                    </div>
                    <ScrollArea className="h-[48dvh] xl:h-[54dvh]">
                      <div className="p-3 space-y-2">
                        {loading ? (
                          <p className="text-sm text-[#a9b8cf]">Loading requests...</p>
                        ) : incomingRequests.length === 0 ? (
                          <p className="text-sm text-[#a9b8cf]">No incoming requests.</p>
                        ) : (
                          incomingRequests.map((request) =>
                            renderPersonRow({
                              id: `incoming:${request.requestId}`,
                              username: request.senderUsername,
                              avatarUrl: request.senderAvatarUrl,
                              subtitle: `${formatMutuals(
                                request.mutualCommunityCount,
                                request.mutualCommunityNames
                              )} · Sent ${formatTimestamp(request.createdAt)}`,
                              badges: (
                                <Badge variant="outline" className="border-[#587aa8] text-[#d5e6ff]">
                                  Incoming
                                </Badge>
                              ),
                              actions: (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      void handleAcceptRequest(request.requestId);
                                    }}
                                    disabled={busyActionKey === `accept-request:${request.requestId}`}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      void handleDeclineRequest(request.requestId);
                                    }}
                                    disabled={busyActionKey === `decline-request:${request.requestId}`}
                                  >
                                    Decline
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-[#f3b3b3] hover:text-[#ffd2d2] hover:bg-[#3b2535]"
                                    onClick={() =>
                                      handleBlockUser({
                                        userId: request.senderUserId,
                                        username: request.senderUsername,
                                      })
                                    }
                                    disabled={busyActionKey === `block-user:${request.senderUserId}`}
                                  >
                                    Block
                                  </Button>
                                </>
                              ),
                              highlighted: highlightedRequestId === request.requestId,
                            })
                          )
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="rounded-md border border-[#304867] bg-[#142033]">
                    <div className="px-3 py-2 border-b border-[#263a58] text-xs text-[#a9b8cf] uppercase tracking-wide">
                      Sent ({outgoingRequests.length})
                    </div>
                    <ScrollArea className="h-[48dvh] xl:h-[54dvh]">
                      <div className="p-3 space-y-2">
                        {loading ? (
                          <p className="text-sm text-[#a9b8cf]">Loading requests...</p>
                        ) : outgoingRequests.length === 0 ? (
                          <p className="text-sm text-[#a9b8cf]">No sent requests.</p>
                        ) : (
                          outgoingRequests.map((request) =>
                            renderPersonRow({
                              id: `outgoing:${request.requestId}`,
                              username: request.recipientUsername,
                              avatarUrl: request.recipientAvatarUrl,
                              subtitle: `${formatMutuals(
                                request.mutualCommunityCount,
                                request.mutualCommunityNames
                              )} · Sent ${formatTimestamp(request.createdAt)}`,
                              badges: (
                                <Badge variant="outline" className="border-[#587aa8] text-[#d5e6ff]">
                                  Pending
                                </Badge>
                              ),
                              actions: (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void handleCancelRequest(request.requestId);
                                  }}
                                    disabled={busyActionKey === `cancel-request:${request.requestId}`}
                                  >
                                    Cancel
                                  </Button>
                              ),
                              highlighted: highlightedRequestId === request.requestId,
                            })
                          )
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="blocked" className="mt-3 min-h-0">
                <div className="rounded-md border border-[#304867] bg-[#142033]">
                  <div className="px-3 py-2 border-b border-[#263a58] text-xs text-[#a9b8cf] uppercase tracking-wide">
                    Blocked Users ({blockedUsers.length})
                  </div>
                  <ScrollArea className="h-[52dvh] xl:h-[56dvh]">
                    <div className="p-3 space-y-2">
                      {loading ? (
                        <p className="text-sm text-[#a9b8cf]">Loading blocked users...</p>
                      ) : blockedUsers.length === 0 ? (
                        <p className="text-sm text-[#a9b8cf]">No blocked users.</p>
                      ) : (
                        blockedUsers.map((blockedUser) =>
                          renderPersonRow({
                            id: `blocked:${blockedUser.blockedUserId}`,
                            username: blockedUser.username,
                            avatarUrl: blockedUser.avatarUrl,
                            subtitle: `Blocked ${formatTimestamp(blockedUser.blockedAt)}`,
                            actions: (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  void handleUnblockUser(blockedUser.blockedUserId);
                                }}
                                disabled={busyActionKey === `unblock-user:${blockedUser.blockedUserId}`}
                              >
                                Unblock
                              </Button>
                            ),
                          })
                        )
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingConfirm)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingConfirm(null);
          }
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === 'removeFriend' ? 'Remove Friend?' : 'Block User?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingConfirm?.kind === 'removeFriend'
                ? `Remove "${pendingConfirm.username}" from your friends list?`
                : pendingConfirm
                  ? `Block "${pendingConfirm.username}"? This removes any friendship and pending friend requests.`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pendingConfirmBusy}
              className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingConfirmBusy}
              onClick={confirmPendingAction}
            >
              {pendingConfirmBusy
                ? pendingConfirm?.kind === 'removeFriend'
                  ? 'Removing...'
                  : 'Blocking...'
                : pendingConfirm?.kind === 'removeFriend'
                  ? 'Remove'
                  : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
