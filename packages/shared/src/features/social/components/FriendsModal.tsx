import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/app/ui/alert-dialog";
import { Badge } from "@shared/app/ui/badge";
import { Button } from "@shared/app/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/app/ui/dialog";
import { Input } from "@shared/app/ui/input";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import { Skeleton } from "@shared/app/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@shared/app/ui/tabs";
import { getSocialBackend } from "@shared/lib/backend";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { RefreshCcw, UserPlus, Users } from "lucide-react";

type FriendsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserDisplayName: string;
  onStartDirectMessage: (friendUserId: string) => void;
  requestedTab?: FriendsTab | null;
  highlightedRequestId?: string | null;
};

type FriendsTab = "friends" | "add" | "requests" | "blocked";
type FriendsConfirmState =
  | { kind: "removeFriend"; friendUserId: string; username: string }
  | { kind: "blockUser"; userId: string; username: string };

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
  if (count <= 0) return "No mutual servers";
  if (names.length === 0)
    return `${count} mutual server${count === 1 ? "" : "s"}`;
  const suffix = count > names.length ? ` (+${count - names.length} more)` : "";
  return `${names.join(", ")}${suffix}`;
};

const renderAvatarInitial = (value: string) =>
  value.trim().charAt(0).toUpperCase() || "U";

export function FriendsModal({
  open,
  onOpenChange,
  currentUserId,
  currentUserDisplayName,
  onStartDirectMessage,
  requestedTab = null,
  highlightedRequestId = null,
}: FriendsModalProps) {
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const [activeTab, setActiveTab] = React.useState<FriendsTab>("friends");
  const [counts, setCounts] = React.useState<SocialCounts>(
    DEFAULT_SOCIAL_COUNTS,
  );
  const [friends, setFriends] = React.useState<FriendSummary[]>([]);
  const [requests, setRequests] = React.useState<FriendRequestSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserSummary[]>(
    [],
  );
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    FriendSearchResult[]
  >([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    React.useState<FriendsConfirmState | null>(null);
  const searchRequestIdRef = React.useRef(0);
  const socialBackend = React.useMemo(() => getSocialBackend(), []);

  const incomingRequests = requests.filter(
    (request) => request.direction === "incoming",
  );
  const outgoingRequests = requests.filter(
    (request) => request.direction === "outgoing",
  );

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
        const [nextCounts, nextFriends, nextRequests, nextBlockedUsers] =
          await Promise.all([
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
        setLoadError(getErrorMessage(error, "Failed to load friends data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUserId, open, socialBackend],
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

    const subscription = socialBackend.subscribeToSocialGraph(
      currentUserId,
      () => {
        void refreshData({ suppressLoadingState: true });
      },
    );

    return () => {
      void subscription.unsubscribe();
    };
  }, [currentUserId, open, refreshData, socialBackend]);

  React.useEffect(() => {
    if (!open || activeTab !== "add") return;

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
          setSearchError(getErrorMessage(error, "Failed to search users."));
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
  }, [activeTab, open, searchQuery, socialBackend]);

  const runMutation = async (
    actionKey: string,
    task: () => Promise<void>,
    options?: { refreshSearch?: boolean },
  ) => {
    setBusyActionKey(actionKey);
    setActionError(null);
    setSearchError(null);
    try {
      await task();
      await refreshData({ suppressLoadingState: true });
      if (
        options?.refreshSearch &&
        activeTab === "add" &&
        searchQuery.trim().length >= 2
      ) {
        const results = await socialBackend.searchUsersForFriendAdd(
          searchQuery.trim(),
        );
        setSearchResults(results);
      }
    } catch (error) {
      const message = getErrorMessage(error, "Failed to complete action.");
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
      { refreshSearch: true },
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
      kind: "removeFriend",
      friendUserId: friend.friendUserId,
      username:
        resolveLiveUsername(
          liveProfiles,
          friend.friendUserId,
          friend.username,
        ) ?? friend.username,
    });
  };

  const handleBlockUser = (input: { userId: string; username: string }) => {
    setPendingConfirm({
      kind: "blockUser",
      userId: input.userId,
      username: input.username,
    });
  };

  const confirmPendingAction = () => {
    if (!pendingConfirm) return;
    const nextConfirm = pendingConfirm;
    setPendingConfirm(null);

    if (nextConfirm.kind === "removeFriend") {
      void runMutation(
        `remove-friend:${nextConfirm.friendUserId}`,
        async () => {
          await socialBackend.removeFriend(nextConfirm.friendUserId);
        },
      );
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
    userId?: string | null;
    username: string;
    avatarUrl: string | null;
    subtitle?: string | null;
    badges?: React.ReactNode;
    actions?: React.ReactNode;
    highlighted?: boolean;
  }) => {
    const username =
      resolveLiveUsername(liveProfiles, input.userId, input.username) ??
      input.username;
    const avatarUrl = resolveLiveAvatarUrl(
      liveProfiles,
      input.userId,
      input.avatarUrl,
    );

    return (
      <div
        key={input.id}
        className={`rounded-md border px-3 py-3 ${
          input.highlighted
            ? "border-border-selected bg-surface-row-active ring-1 ring-border-selected/50"
            : "border-border bg-surface-panel"
        }`}
      >
        <div className="flex items-start gap-3">
          <Avatar className="size-10 rounded-xl border border-border bg-surface-skeleton">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
            <AvatarFallback className="rounded-xl bg-surface-skeleton text-white text-xs">
              {renderAvatarInitial(username)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white break-all">
                {username}
              </p>
              {input.badges}
            </div>
            {input.subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{input.subtitle}</p>
            )}
            {input.actions && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {input.actions}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const pendingConfirmActionKey =
    pendingConfirm?.kind === "removeFriend"
      ? `remove-friend:${pendingConfirm.friendUserId}`
      : pendingConfirm
        ? `block-user:${pendingConfirm.userId}`
        : null;
  const pendingConfirmBusy =
    pendingConfirmActionKey !== null &&
    busyActionKey === pendingConfirmActionKey;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="app"
          className="border-border bg-surface-app text-white p-0 overflow-hidden"
        >
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="px-5 py-4 border-b border-border-panel bg-[linear-gradient(135deg,var(--card)_0%,var(--surface-inset)_70%,var(--surface-app)_100%)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <Users className="size-5 text-icon-blue" />
                    Friends
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Manage friends, requests, and blocked users before starting
                    direct messages.
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-border-badge text-nav"
                  >
                    {currentUserDisplayName}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void refreshData({ suppressLoadingState: true });
                    }}
                    disabled={refreshing || loading}
                    className="border-border text-white"
                  >
                    <RefreshCcw
                      className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 p-4">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as FriendsTab)}
                className="h-full min-h-0"
              >
                <TabsList className="bg-surface-legal border border-border">
                  <TabsTrigger
                    value="friends"
                    className="data-[state=active]:bg-surface-hover"
                  >
                    Friends
                    <Badge
                      variant="outline"
                      className="ml-1 border-border text-pill"
                    >
                      {counts.friendsCount}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="add"
                    className="data-[state=active]:bg-surface-hover"
                  >
                    Add Friend
                  </TabsTrigger>
                  <TabsTrigger
                    value="requests"
                    className="data-[state=active]:bg-surface-hover"
                  >
                    Requests
                    <Badge
                      variant="outline"
                      className={`ml-1 border-border ${
                        counts.incomingPendingRequestCount > 0
                          ? "text-danger-pale"
                          : "text-pill"
                      }`}
                    >
                      {counts.incomingPendingRequestCount}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="blocked"
                    className="data-[state=active]:bg-surface-hover"
                  >
                    Blocked
                    <Badge
                      variant="outline"
                      className="ml-1 border-border text-pill"
                    >
                      {counts.blockedUserCount}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                {(loadError || actionError) && (
                  <div className="mt-3 rounded-md border border-border-destructive-panel bg-surface-destructive-panel px-3 py-2 text-sm text-destructive-banner">
                    {actionError ?? loadError}
                  </div>
                )}

                <TabsContent value="friends" className="mt-3 min-h-0">
                  <div className="rounded-md border border-border bg-surface-panel">
                    <div className="px-3 py-2 border-b border-border-panel text-xs text-muted-foreground uppercase tracking-wide">
                      Friends ({friends.length})
                    </div>
                    <ScrollArea className="h-[52dvh] xl:h-[56dvh]">
                      <div className="p-3 space-y-2">
                        {loading ? (
                          Array.from({ length: 4 }, (_, index) => (
                            <div
                              key={index}
                              className="rounded-md border border-border bg-surface-app/60 px-3 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <Skeleton className="size-10 rounded-xl bg-surface-hover" />
                                <div className="min-w-0 flex-1 space-y-2">
                                  <Skeleton className="h-4 w-28 bg-surface-hover" />
                                  <Skeleton className="h-3 w-3/4 bg-surface-skeleton" />
                                  <div className="flex gap-2">
                                    <Skeleton className="h-8 w-20 bg-surface-hover" />
                                    <Skeleton className="h-8 w-20 bg-surface-hover" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : friends.length === 0 ? (
                          <div className="rounded-md border border-dashed border-border bg-surface-app/60 p-4">
                            <p className="text-sm text-muted-foreground">
                              No friends yet.
                            </p>
                            <p className="mt-1 text-xs text-auxiliary">
                              Use the Add Friend tab to search by exact
                              username.
                            </p>
                          </div>
                        ) : (
                          friends.map((friend) =>
                            renderPersonRow({
                              id: `friend:${friend.friendUserId}`,
                              userId: friend.friendUserId,
                              username: friend.username,
                              avatarUrl: friend.avatarUrl,
                              subtitle: `${formatMutuals(
                                friend.mutualCommunityCount,
                                friend.mutualCommunityNames,
                              )} · Friends since ${formatTimestamp(friend.friendshipCreatedAt)}`,
                              actions: (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      handleMessageFriend(friend.friendUserId)
                                    }
                                  >
                                    Message
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleRemoveFriend(friend)}
                                    disabled={
                                      busyActionKey ===
                                      `remove-friend:${friend.friendUserId}`
                                    }
                                  >
                                    Remove
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive-row hover:text-destructive-hover-fg hover:bg-surface-destructive-row-hover"
                                    onClick={() =>
                                      handleBlockUser({
                                        userId: friend.friendUserId,
                                        username:
                                          resolveLiveUsername(
                                            liveProfiles,
                                            friend.friendUserId,
                                            friend.username,
                                          ) ?? friend.username,
                                      })
                                    }
                                    disabled={
                                      busyActionKey ===
                                      `block-user:${friend.friendUserId}`
                                    }
                                  >
                                    Block
                                  </Button>
                                </>
                              ),
                            }),
                          )
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="add" className="mt-3 min-h-0">
                  <div className="rounded-md border border-border bg-surface-panel p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Enter exact username"
                        className="bg-surface-app border-border text-white placeholder:text-muted-foreground"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-border text-white"
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
                              setSearchError(
                                getErrorMessage(
                                  error,
                                  "Failed to search users.",
                                ),
                              );
                              setSearchResults([]);
                            })
                            .finally(() => {
                              setSearchLoading(false);
                            });
                        }}
                        disabled={
                          searchLoading || searchQuery.trim().length < 2
                        }
                      >
                        Search
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Search is exact username match (case-insensitive) and
                      debounced by 150ms.
                    </p>
                    {searchError && (
                      <p className="mt-2 text-sm text-red-300">{searchError}</p>
                    )}
                  </div>

                  <div className="mt-3 rounded-md border border-border bg-surface-panel">
                    <div className="px-3 py-2 border-b border-border-panel text-xs text-muted-foreground uppercase tracking-wide">
                      Search Results
                    </div>
                    <ScrollArea className="h-[44dvh] xl:h-[48dvh]">
                      <div className="p-3 space-y-2">
                        {searchLoading ? (
                          <p className="text-sm text-muted-foreground">Searching...</p>
                        ) : searchQuery.trim().length < 2 ? (
                          <p className="text-sm text-muted-foreground">
                            Type at least 2 characters to search.
                          </p>
                        ) : searchResults.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No matching users found.
                          </p>
                        ) : (
                          searchResults.map((result) => {
                            const busyKey = `send-request:${result.username.toLowerCase()}`;
                            const pendingRequestId = result.pendingRequestId;
                            const relationshipBadge = (() => {
                              switch (result.relationshipState) {
                                case "friend":
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="border-border text-pill"
                                    >
                                      Friend
                                    </Badge>
                                  );
                                case "incoming_pending":
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="border-border-cta text-nav-strong"
                                    >
                                      Incoming request
                                    </Badge>
                                  );
                                case "outgoing_pending":
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="border-border-cta text-nav-strong"
                                    >
                                      Request sent
                                    </Badge>
                                  );
                                default:
                                  return null;
                              }
                            })();

                            const actions =
                              result.relationshipState === "none" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    void handleSendFriendRequest(
                                      result.username,
                                    );
                                  }}
                                  disabled={busyActionKey === busyKey}
                                >
                                  <UserPlus className="size-4" />
                                  Send Friend Request
                                </Button>
                              ) : result.relationshipState ===
                                  "incoming_pending" && pendingRequestId ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      void handleAcceptRequest(
                                        pendingRequestId,
                                      );
                                    }}
                                    disabled={
                                      busyActionKey ===
                                      `accept-request:${pendingRequestId}`
                                    }
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      void handleDeclineRequest(
                                        pendingRequestId,
                                      );
                                    }}
                                    disabled={
                                      busyActionKey ===
                                      `decline-request:${pendingRequestId}`
                                    }
                                  >
                                    Decline
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled
                                >
                                  {result.relationshipState === "friend"
                                    ? "Already Friends"
                                    : "Pending"}
                                </Button>
                              );

                            return renderPersonRow({
                              id: `search:${result.userId}`,
                              userId: result.userId,
                              username: result.username,
                              avatarUrl: result.avatarUrl,
                              subtitle: formatMutuals(
                                result.mutualCommunityCount,
                                result.mutualCommunityNames,
                              ),
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
                    <div className="rounded-md border border-border bg-surface-panel">
                      <div className="px-3 py-2 border-b border-border-panel text-xs text-muted-foreground uppercase tracking-wide">
                        Incoming ({incomingRequests.length})
                      </div>
                      <ScrollArea className="h-[48dvh] xl:h-[54dvh]">
                        <div className="p-3 space-y-2">
                          {loading ? (
                            Array.from({ length: 3 }, (_, index) => (
                              <div
                                key={index}
                                className="rounded-md border border-border bg-surface-app/60 px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <Skeleton className="size-10 rounded-xl bg-surface-hover" />
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <Skeleton className="h-4 w-28 bg-surface-hover" />
                                    <Skeleton className="h-3 w-3/4 bg-surface-skeleton" />
                                    <div className="flex gap-2">
                                      <Skeleton className="h-8 w-16 bg-surface-hover" />
                                      <Skeleton className="h-8 w-16 bg-surface-hover" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : incomingRequests.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No incoming requests.
                            </p>
                          ) : (
                            incomingRequests.map((request) =>
                              renderPersonRow({
                                id: `incoming:${request.requestId}`,
                                userId: request.senderUserId,
                                username: request.senderUsername,
                                avatarUrl: request.senderAvatarUrl,
                                subtitle: `${formatMutuals(
                                  request.mutualCommunityCount,
                                  request.mutualCommunityNames,
                                )} · Sent ${formatTimestamp(request.createdAt)}`,
                                badges: (
                                  <Badge
                                    variant="outline"
                                    className="border-border-cta text-nav-strong"
                                  >
                                    Incoming
                                  </Badge>
                                ),
                                actions: (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        void handleAcceptRequest(
                                          request.requestId,
                                        );
                                      }}
                                      disabled={
                                        busyActionKey ===
                                        `accept-request:${request.requestId}`
                                      }
                                    >
                                      Accept
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        void handleDeclineRequest(
                                          request.requestId,
                                        );
                                      }}
                                      disabled={
                                        busyActionKey ===
                                        `decline-request:${request.requestId}`
                                      }
                                    >
                                      Decline
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive-row hover:text-destructive-hover-fg hover:bg-surface-destructive-row-hover"
                                      onClick={() =>
                                        handleBlockUser({
                                          userId: request.senderUserId,
                                          username:
                                            resolveLiveUsername(
                                              liveProfiles,
                                              request.senderUserId,
                                              request.senderUsername,
                                            ) ?? request.senderUsername,
                                        })
                                      }
                                      disabled={
                                        busyActionKey ===
                                        `block-user:${request.senderUserId}`
                                      }
                                    >
                                      Block
                                    </Button>
                                  </>
                                ),
                                highlighted:
                                  highlightedRequestId === request.requestId,
                              }),
                            )
                          )}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="rounded-md border border-border bg-surface-panel">
                      <div className="px-3 py-2 border-b border-border-panel text-xs text-muted-foreground uppercase tracking-wide">
                        Sent ({outgoingRequests.length})
                      </div>
                      <ScrollArea className="h-[48dvh] xl:h-[54dvh]">
                        <div className="p-3 space-y-2">
                          {loading ? (
                            Array.from({ length: 3 }, (_, index) => (
                              <div
                                key={index}
                                className="rounded-md border border-border bg-surface-app/60 px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <Skeleton className="size-10 rounded-xl bg-surface-hover" />
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <Skeleton className="h-4 w-28 bg-surface-hover" />
                                    <Skeleton className="h-3 w-3/4 bg-surface-skeleton" />
                                    <div className="flex gap-2">
                                      <Skeleton className="h-8 w-20 bg-surface-hover" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : outgoingRequests.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No sent requests.
                            </p>
                          ) : (
                            outgoingRequests.map((request) =>
                              renderPersonRow({
                                id: `outgoing:${request.requestId}`,
                                userId: request.recipientUserId,
                                username: request.recipientUsername,
                                avatarUrl: request.recipientAvatarUrl,
                                subtitle: `${formatMutuals(
                                  request.mutualCommunityCount,
                                  request.mutualCommunityNames,
                                )} · Sent ${formatTimestamp(request.createdAt)}`,
                                badges: (
                                  <Badge
                                    variant="outline"
                                    className="border-border-cta text-nav-strong"
                                  >
                                    Pending
                                  </Badge>
                                ),
                                actions: (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      void handleCancelRequest(
                                        request.requestId,
                                      );
                                    }}
                                    disabled={
                                      busyActionKey ===
                                      `cancel-request:${request.requestId}`
                                    }
                                  >
                                    Cancel
                                  </Button>
                                ),
                                highlighted:
                                  highlightedRequestId === request.requestId,
                              }),
                            )
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="blocked" className="mt-3 min-h-0">
                  <div className="rounded-md border border-border bg-surface-panel">
                    <div className="px-3 py-2 border-b border-border-panel text-xs text-muted-foreground uppercase tracking-wide">
                      Blocked Users ({blockedUsers.length})
                    </div>
                    <ScrollArea className="h-[52dvh] xl:h-[56dvh]">
                      <div className="p-3 space-y-2">
                        {loading ? (
                          Array.from({ length: 3 }, (_, index) => (
                            <div
                              key={index}
                              className="rounded-md border border-border bg-surface-app/60 px-3 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <Skeleton className="size-10 rounded-xl bg-surface-hover" />
                                <div className="min-w-0 flex-1 space-y-2">
                                  <Skeleton className="h-4 w-28 bg-surface-hover" />
                                  <Skeleton className="h-3 w-3/4 bg-surface-skeleton" />
                                  <Skeleton className="h-8 w-20 bg-surface-hover" />
                                </div>
                              </div>
                            </div>
                          ))
                        ) : blockedUsers.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No blocked users.
                          </p>
                        ) : (
                          blockedUsers.map((blockedUser) =>
                            renderPersonRow({
                              id: `blocked:${blockedUser.blockedUserId}`,
                              userId: blockedUser.blockedUserId,
                              username: blockedUser.username,
                              avatarUrl: blockedUser.avatarUrl,
                              subtitle: `Blocked ${formatTimestamp(blockedUser.blockedAt)}`,
                              actions: (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void handleUnblockUser(
                                      blockedUser.blockedUserId,
                                    );
                                  }}
                                  disabled={
                                    busyActionKey ===
                                    `unblock-user:${blockedUser.blockedUserId}`
                                  }
                                >
                                  Unblock
                                </Button>
                              ),
                            }),
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
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === "removeFriend"
                ? "Remove Friend?"
                : "Block User?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {pendingConfirm?.kind === "removeFriend"
                ? `Remove "${pendingConfirm.username}" from your friends list?`
                : pendingConfirm
                  ? `Block "${pendingConfirm.username}"? This removes any friendship and pending friend requests.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pendingConfirmBusy}
              className="bg-muted border-border text-white hover:bg-secondary"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingConfirmBusy}
              onClick={confirmPendingAction}
            >
              {pendingConfirmBusy
                ? pendingConfirm?.kind === "removeFriend"
                  ? "Removing..."
                  : "Blocking..."
                : pendingConfirm?.kind === "removeFriend"
                  ? "Remove"
                  : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
