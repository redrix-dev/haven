import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Ban, Check, MessageCircle, Search, UserPlus, X } from "lucide-solid";
import type { FriendsPanelTab } from "@shared/types/types";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
  type LiveProfilesRecord,
} from "@shared/lib/liveProfiles";
import { requireHavenSolidCore } from "@solid-client/core";
import {
  createSocialBlockedUsers,
  createSocialCounts,
  createSocialFriendRequests,
  createSocialFriends,
  createSocialLoading,
} from "@solid-client/data/social";
import { Avatar, Button } from "@solid-client/components/ui";

const TABS: { id: FriendsPanelTab; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "add", label: "Add" },
  { id: "requests", label: "Requests" },
  { id: "blocked", label: "Blocked" },
];

export function FriendsView() {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const counts = createSocialCounts(core.social);
  const friends = createSocialFriends(core.social);
  const requests = createSocialFriendRequests(core.social);
  const blockedUsers = createSocialBlockedUsers(core.social);
  const loading = createSocialLoading(core.social);
  const liveProfiles = core.profiles.liveProfiles();

  const [activeTab, setActiveTab] = createSignal<FriendsPanelTab>("friends");
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [actionNotice, setActionNotice] = createSignal<string | null>(null);
  const [busyActionKey, setBusyActionKey] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<FriendSearchResult[]>(
    [],
  );
  const [searchLoading, setSearchLoading] = createSignal(false);
  const [searchError, setSearchError] = createSignal<string | null>(null);

  const incomingRequests = createMemo(() =>
    requests().filter((request) => request.direction === "incoming"),
  );
  const outgoingRequests = createMemo(() =>
    requests().filter((request) => request.direction === "outgoing"),
  );

  createEffect(() => {
    setLoadError(null);
    void core.social.ensureLoaded().catch((error) => {
      setLoadError(getErrorMessage(error, "Failed to load friends."));
    });
  });

  createEffect(() => {
    const query = searchQuery().trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    void core.social
      .searchUsers(query)
      .then((results) => {
        if (!cancelled) setSearchResults(results);
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
  });

  const refresh = async () => {
    setLoadError(null);
    try {
      await core.social.load();
    } catch (error) {
      setLoadError(getErrorMessage(error, "Failed to load friends."));
    }
  };

  const runMutation = async (
    actionKey: string,
    successMessage: string,
    fn: () => Promise<void>,
  ) => {
    if (busyActionKey()) return;
    setBusyActionKey(actionKey);
    setActionError(null);
    setActionNotice(null);
    try {
      await fn();
      setActionNotice(successMessage);
    } catch (error) {
      setActionError(getErrorMessage(error, "Action failed."));
    } finally {
      setBusyActionKey(null);
    }
  };

  const friendLabel = (friend: FriendSummary): string =>
    resolveLiveUsername(
      liveProfiles(),
      friend.friendUserId,
      friend.username,
    )?.trim() || friend.username;

  const startDirectMessage = async (friend: FriendSummary) => {
    await runMutation(
      `dm:${friend.friendUserId}`,
      "Conversation opened.",
      async () => {
        const conversationId = await core.directMessages.openWithUser(
          friend.friendUserId,
        );
        navigate(`/direct-messages/${conversationId}`);
      },
    );
  };

  return (
    <div class="flex h-full min-w-0 flex-1 bg-surface-app">
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface-panel">
        <header class="flex h-12 shrink-0 items-center border-b border-border px-4">
          <h1 class="text-sm font-semibold text-foreground">Friends</h1>
        </header>
        <nav class="flex flex-col gap-1 p-2">
          <For each={TABS}>
            {(tab) => (
              <button
                class="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-body-soft hover:bg-surface-list-hover hover:text-foreground"
                classList={{
                  "bg-surface-row-selected text-foreground":
                    activeTab() === tab.id,
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <Show
                  when={
                    tab.id === "requests" &&
                    counts().incomingPendingRequestCount > 0
                  }
                >
                  <span class="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {counts().incomingPendingRequestCount}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </nav>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div>
            <h2 class="text-sm font-semibold text-foreground">
              {TABS.find((tab) => tab.id === activeTab())?.label ?? "Friends"}
            </h2>
            <p class="text-xs text-muted-foreground">
              {activeTab() === "friends"
                ? `${counts().friendsCount} friends`
                : activeTab() === "requests"
                  ? `${incomingRequests().length} incoming, ${
                      outgoingRequests().length
                    } outgoing`
                  : activeTab() === "blocked"
                    ? `${counts().blockedUserCount} blocked`
                    : "Search by username"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading()}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <Show when={loadError()}>
            <p class="mb-3 rounded border border-border bg-surface-panel px-3 py-2 text-sm text-send-error">
              {loadError()}
            </p>
          </Show>
          <Show when={actionError()}>
            <p class="mb-3 rounded border border-border bg-surface-panel px-3 py-2 text-sm text-send-error">
              {actionError()}
            </p>
          </Show>
          <Show when={actionNotice()}>
            <p class="mb-3 rounded border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
              {actionNotice()}
            </p>
          </Show>
          <Show when={loading()}>
            <p class="mb-3 text-sm text-muted-foreground">Loading...</p>
          </Show>

          <Show when={activeTab() === "friends"}>
            <FriendsList
              friends={friends()}
              busyActionKey={busyActionKey()}
              labelForFriend={friendLabel}
              liveProfiles={liveProfiles()}
              onStartDirectMessage={(friend) => void startDirectMessage(friend)}
            />
          </Show>

          <Show when={activeTab() === "add"}>
            <AddFriendPanel
              query={searchQuery()}
              results={searchResults()}
              loading={searchLoading()}
              error={searchError()}
              busyActionKey={busyActionKey()}
              onQueryChange={setSearchQuery}
              onSendRequest={(result) =>
                void runMutation(
                  `send:${result.username}`,
                  `Friend request sent to ${result.username}.`,
                  async () => {
                    await core.social.sendFriendRequest(result.username);
                  },
                )
              }
            />
          </Show>

          <Show when={activeTab() === "requests"}>
            <RequestsPanel
              incoming={incomingRequests()}
              outgoing={outgoingRequests()}
              busyActionKey={busyActionKey()}
              onAccept={(request) =>
                void runMutation(
                  `accept:${request.requestId}`,
                  `${request.senderUsername} is now your friend.`,
                  async () => {
                    await core.social.acceptFriendRequest(request.requestId);
                  },
                )
              }
              onDecline={(request) =>
                void runMutation(
                  `decline:${request.requestId}`,
                  "Friend request declined.",
                  async () => {
                    await core.social.declineFriendRequest(request.requestId);
                  },
                )
              }
              onCancel={(request) =>
                void runMutation(
                  `cancel:${request.requestId}`,
                  "Friend request canceled.",
                  async () => {
                    await core.social.cancelFriendRequest(request.requestId);
                  },
                )
              }
            />
          </Show>

          <Show when={activeTab() === "blocked"}>
            <BlockedPanel
              blockedUsers={blockedUsers()}
              busyActionKey={busyActionKey()}
              onUnblock={(blockedUser) =>
                void runMutation(
                  `unblock:${blockedUser.blockedUserId}`,
                  `${blockedUser.username} was unblocked.`,
                  async () => {
                    await core.social.unblockUser(blockedUser.blockedUserId);
                  },
                )
              }
            />
          </Show>
        </div>
      </main>
    </div>
  );
}

function FriendsList(props: {
  friends: FriendSummary[];
  busyActionKey: string | null;
  labelForFriend: (friend: FriendSummary) => string;
  liveProfiles: LiveProfilesRecord;
  onStartDirectMessage: (friend: FriendSummary) => void;
}) {
  return (
    <Show
      when={props.friends.length > 0}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          No friends yet.
        </div>
      }
    >
      <div class="divide-y divide-border">
        <For each={props.friends}>
          {(friend) => {
            const label = () => props.labelForFriend(friend);
            const avatarUrl = () =>
              resolveLiveAvatarUrl(
                props.liveProfiles,
                friend.friendUserId,
                friend.avatarUrl,
              );
            return (
              <div class="flex items-center gap-3 py-3">
                <Avatar src={avatarUrl()} name={label()} size="lg" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-foreground">
                    {label()}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    {friend.mutualCommunityCount > 0
                      ? `${friend.mutualCommunityCount} mutual ${
                          friend.mutualCommunityCount === 1
                            ? "server"
                            : "servers"
                        }`
                      : "No mutual servers"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.busyActionKey !== null}
                  onClick={() => props.onStartDirectMessage(friend)}
                >
                  <MessageCircle size={15} />
                  Message
                </Button>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

function AddFriendPanel(props: {
  query: string;
  results: FriendSearchResult[];
  loading: boolean;
  error: string | null;
  busyActionKey: string | null;
  onQueryChange: (query: string) => void;
  onSendRequest: (result: FriendSearchResult) => void;
}) {
  return (
    <div class="flex h-full min-h-0 flex-col">
      <label class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Search
      </label>
      <div class="mb-3 flex items-center gap-2 rounded-lg border border-input bg-surface-input px-3 py-2">
        <Search size={16} class="text-muted-foreground" />
        <input
          value={props.query}
          placeholder="Search by username"
          autocapitalize="none"
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          class="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <Show when={props.error}>
        <p class="mb-3 text-sm text-send-error">{props.error}</p>
      </Show>
      <Show when={props.loading}>
        <p class="mb-3 text-sm text-muted-foreground">Searching...</p>
      </Show>
      <Show
        when={props.query.trim().length >= 2}
        fallback={
          <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </div>
        }
      >
        <Show
          when={props.results.length > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No results.
            </div>
          }
        >
          <div class="divide-y divide-border">
            <For each={props.results}>
              {(result) => (
                <div class="flex items-center gap-3 py-3">
                  <Avatar
                    src={result.avatarUrl}
                    name={result.username}
                    size="lg"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-foreground">
                      {result.username}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {relationshipLabel(result)}
                    </p>
                  </div>
                  <Show when={result.relationshipState === "none"}>
                    <Button
                      size="sm"
                      disabled={props.busyActionKey !== null}
                      onClick={() => props.onSendRequest(result)}
                    >
                      <UserPlus size={15} />
                      Add
                    </Button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function RequestsPanel(props: {
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
  busyActionKey: string | null;
  onAccept: (request: FriendRequestSummary) => void;
  onDecline: (request: FriendRequestSummary) => void;
  onCancel: (request: FriendRequestSummary) => void;
}) {
  return (
    <div class="grid gap-6">
      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Incoming
        </h3>
        <Show
          when={props.incoming.length > 0}
          fallback={
            <p class="py-4 text-sm text-muted-foreground">
              No pending friend requests.
            </p>
          }
        >
          <div class="divide-y divide-border">
            <For each={props.incoming}>
              {(request) => (
                <div class="flex items-center gap-3 py-3">
                  <Avatar
                    src={request.senderAvatarUrl}
                    name={request.senderUsername}
                    size="lg"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-foreground">
                      {request.senderUsername}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {request.mutualCommunityCount > 0
                        ? `${request.mutualCommunityCount} mutual ${
                            request.mutualCommunityCount === 1
                              ? "server"
                              : "servers"
                          }`
                        : "Incoming request"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={props.busyActionKey !== null}
                    onClick={() => props.onAccept(request)}
                  >
                    <Check size={15} />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={props.busyActionKey !== null}
                    onClick={() => props.onDecline(request)}
                  >
                    <X size={15} />
                    Decline
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Outgoing
        </h3>
        <Show
          when={props.outgoing.length > 0}
          fallback={
            <p class="py-4 text-sm text-muted-foreground">
              No outgoing friend requests.
            </p>
          }
        >
          <div class="divide-y divide-border">
            <For each={props.outgoing}>
              {(request) => (
                <div class="flex items-center gap-3 py-3">
                  <Avatar
                    src={request.recipientAvatarUrl}
                    name={request.recipientUsername}
                    size="lg"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-foreground">
                      {request.recipientUsername}
                    </p>
                    <p class="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={props.busyActionKey !== null}
                    onClick={() => props.onCancel(request)}
                  >
                    <X size={15} />
                    Cancel
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </div>
  );
}

function BlockedPanel(props: {
  blockedUsers: BlockedUserSummary[];
  busyActionKey: string | null;
  onUnblock: (blockedUser: BlockedUserSummary) => void;
}) {
  return (
    <Show
      when={props.blockedUsers.length > 0}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          No blocked users.
        </div>
      }
    >
      <div class="divide-y divide-border">
        <For each={props.blockedUsers}>
          {(blockedUser) => (
            <div class="flex items-center gap-3 py-3">
              <Avatar
                src={blockedUser.avatarUrl}
                name={blockedUser.username}
                size="lg"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-foreground">
                  {blockedUser.username}
                </p>
                <p class="text-xs text-muted-foreground">
                  Blocked {timeLabel(blockedUser.blockedAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={props.busyActionKey !== null}
                onClick={() => props.onUnblock(blockedUser)}
              >
                <Ban size={15} />
                Unblock
              </Button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function relationshipLabel(result: FriendSearchResult): string {
  if (result.relationshipState === "friend") return "Already friends";
  if (result.relationshipState === "incoming_pending") {
    return "Sent you a request";
  }
  if (result.relationshipState === "outgoing_pending") return "Request pending";
  if (result.mutualCommunityCount > 0) {
    return `${result.mutualCommunityCount} mutual ${
      result.mutualCommunityCount === 1 ? "server" : "servers"
    }`;
  }
  return "Not connected";
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
