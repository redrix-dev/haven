import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";
import type { FriendsPanelTab } from "@shared/types/types";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
} from "@shared/lib/backend/types";
import { resolveLiveUsername } from "@shared/infrastructure/liveProfiles";
import { useHavenCore } from "@shared/core";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import type { UserProfileModalTarget } from "@/features/user-profile/UserProfileModal";
import { ThemedIonicons } from "@/theme-rn";

type FriendsModalContainerProps = {
  visible: boolean;
  userId: string | null;
  initialTab: FriendsPanelTab;
  highlightedRequestId: string | null;
  onStartDirectMessage: (friendUserId: string, displayLabel?: string) => void;
  onOpenProfile: (target: UserProfileModalTarget) => void;
};

const TABS: { id: FriendsPanelTab; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "add", label: "Add" },
  { id: "requests", label: "Requests" },
  { id: "blocked", label: "Blocked" },
];

export function FriendsModalContainer({
  visible,
  userId,
  initialTab,
  highlightedRequestId,
  onStartDirectMessage,
  onOpenProfile,
}: FriendsModalContainerProps) {
  const core = useHavenCore();
  const social = core.social;
  const liveProfiles = core.profiles.useProfilesRecord();
  const counts = social.useCounts();
  const friends = social.useFriends();
  const requests = social.useFriendRequests();
  const blockedUsers = social.useBlockedUsers();
  const nexusLoading = social.useIsLoading();
  const [activeTab, setActiveTab] = useState<FriendsPanelTab>("friends");
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
        if (options?.suppressLoadingState) {
          await social.load();
        } else {
          await social.ensureLoaded();
        }
      } catch (error) {
        setLoadError(getErrorMessage(error, "Failed to load friends data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [social, userId, visible],
  );

  const runMutation = useCallback(
    async (actionKey: string, fn: () => Promise<void>) => {
      setBusyActionKey(actionKey);
      setActionError(null);
      try {
        await fn();
        await social.load();
      } catch (error) {
        setActionError(getErrorMessage(error, "Action failed."));
      } finally {
        setBusyActionKey(null);
      }
    },
    [social],
  );

  useEffect(() => {
    if (visible) setActiveTab(initialTab);
  }, [initialTab, visible]);

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
    void social
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
  }, [searchQuery, social, visible]);

  const incomingRequests = useMemo(
    () => requests.filter((r) => r.direction === "incoming"),
    [requests],
  );
  const outgoingRequests = useMemo(
    () => requests.filter((r) => r.direction === "outgoing"),
    [requests],
  );

  const labelForFriend = useCallback(
    (friend: FriendSummary) =>
      resolveLiveUsername(liveProfiles, friend.friendUserId, friend.username)?.trim() ||
      friend.username,
    [liveProfiles],
  );

  const renderAvatar = useCallback((label: string, avatarUrl: string | null) => (
    <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          className="h-12 w-12"
          resizeMode="cover"
          accessibilityLabel={`${label} avatar`}
        />
      ) : (
        <Text className="text-base font-semibold text-foreground">
          {label.trim().charAt(0).toUpperCase() || "U"}
        </Text>
      )}
    </View>
  ), []);

  const renderFriend: ListRenderItem<FriendSummary> = useCallback(
    ({ item }) => {
      const label = labelForFriend(item);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${label} profile`}
          onPress={() => {
            onOpenProfile({
              userId: item.friendUserId,
              username: label,
              avatarUrl: item.avatarUrl,
            });
          }}
          className="flex-row items-center gap-3 border-b border-border py-4 active:bg-surface-hover"
        >
          {renderAvatar(label, item.avatarUrl)}
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-foreground">{label}</Text>
            <Text className="text-xs text-muted-foreground">
              {item.mutualCommunityCount > 0
                ? `${item.mutualCommunityCount} mutual server${item.mutualCommunityCount === 1 ? "" : "s"}`
                : "No mutual servers"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${label}`}
            className="h-10 w-10 items-center justify-center rounded-xl bg-accent-slider"
            onPress={(event) => {
              event.stopPropagation();
              onStartDirectMessage(item.friendUserId, label);
            }}
          >
            <ThemedIonicons
              name="chatbubble-outline"
              size={18}
              colorClassName="accent-primary-foreground"
            />
          </Pressable>
        </Pressable>
      );
    },
    [labelForFriend, onOpenProfile, onStartDirectMessage, renderAvatar],
  );

  const renderIncomingRequest = useCallback(
    ({ item }: { item: FriendRequestSummary }) => (
      <View
        className={`border-b border-border py-3 pl-2 ${
          item.requestId === highlightedRequestId ? "border-l-4 border-l-accent-slider" : ""
        }`}
      >
        <Text className="text-base font-medium text-foreground">{item.senderUsername}</Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable
            className="rounded-lg bg-accent-slider px-3 py-2"
            disabled={busyActionKey !== null}
            onPress={() =>
              void runMutation(`accept:${item.requestId}`, async () => {
                await social.acceptFriendRequest(item.requestId);
              })
            }
          >
            <Text className="text-sm font-semibold text-primary-foreground">Accept</Text>
          </Pressable>
          <Pressable
            className="rounded-lg bg-surface-panel px-3 py-2"
            disabled={busyActionKey !== null}
            onPress={() =>
              void runMutation(`decline:${item.requestId}`, async () => {
                await social.declineFriendRequest(item.requestId);
              })
            }
          >
            <Text className="text-sm text-foreground">Decline</Text>
          </Pressable>
        </View>
      </View>
    ),
    [busyActionKey, highlightedRequestId, runMutation, social],
  );

  const renderOutgoingRequest = useCallback(
    ({ item }: { item: FriendRequestSummary }) => (
      <View className="flex-row items-center justify-between border-b border-border py-3">
        <Text className="text-base text-foreground">{item.recipientUsername}</Text>
        <Pressable
          className="rounded-lg bg-surface-panel px-3 py-2"
          disabled={busyActionKey !== null}
          onPress={() =>
            void runMutation(`cancel:${item.requestId}`, async () => {
              await social.cancelFriendRequest(item.requestId);
            })
          }
        >
          <Text className="text-sm text-foreground">Cancel</Text>
        </Pressable>
      </View>
    ),
    [busyActionKey, runMutation, social],
  );

  const renderBlocked: ListRenderItem<BlockedUserSummary> = useCallback(
    ({ item }) => (
      <View className="flex-row items-center justify-between border-b border-border py-3">
        <Text className="text-base text-foreground">{item.username}</Text>
        <Pressable
          className="rounded-lg bg-surface-panel px-3 py-2"
          disabled={busyActionKey !== null}
          onPress={() =>
            void runMutation(`unblock:${item.blockedUserId}`, async () => {
              await social.unblockUser(item.blockedUserId);
            })
          }
        >
          <Text className="text-sm text-foreground">Unblock</Text>
        </Pressable>
      </View>
    ),
    [busyActionKey, runMutation, social],
  );

  const renderSearchResult: ListRenderItem<FriendSearchResult> = useCallback(
    ({ item }) => {
      const busy =
        busyActionKey?.startsWith(`send:${item.username}`) ?? false;
      return (
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-base text-foreground">{item.username}</Text>
            <Text className="text-xs capitalize text-muted-foreground">{item.relationshipState}</Text>
          </View>
          {item.relationshipState === "none" ? (
            <Pressable
              className="rounded-lg bg-accent-slider px-3 py-2"
              disabled={busy || busyActionKey !== null}
              onPress={() =>
                void runMutation(
                  `send:${item.username}`,
                  async () => {
                    await social.sendFriendRequest(item.username);
                  },
                )
              }
            >
              <Text className="text-sm font-semibold text-primary-foreground">Add</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [busyActionKey, runMutation, social],
  );

  if (!visible) {
    return null;
  }

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-3 flex-row flex-wrap gap-2">
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            className={`rounded-full px-3 py-1.5 ${
              activeTab === tab.id ? "bg-accent-slider" : "bg-surface-panel"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                activeTab === tab.id ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "requests" && counts.incomingPendingRequestCount > 0
                ? ` (${counts.incomingPendingRequestCount})`
                : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {loadError ? (
        <Text className="mb-2 text-sm text-destructive">{loadError}</Text>
      ) : null}
      {actionError ? (
        <Text className="mb-2 text-sm text-destructive">{actionError}</Text>
      ) : null}

      {(loading || nexusLoading) && !refreshing ? (
        // uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground
        <ActivityIndicator color="#e6edf7" />
      ) : null}

      {activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.friendUserId}
          renderItem={renderFriend}
          refreshing={refreshing}
          onRefresh={() => void refreshData({ suppressLoadingState: true })}
          ListEmptyComponent={
            <Text className="py-6 text-center text-muted-foreground">No friends yet.</Text>
          }
        />
      ) : null}

      {activeTab === "requests" ? (
        <ScrollView
          className="flex-1"
          refreshControl={
            // uniwind-theme-allow mobile-theme/no-raw-color-prop - RefreshControl tintColor requires raw color; resolves to --foreground
            <RefreshControl refreshing={refreshing} onRefresh={() => void refreshData({ suppressLoadingState: true })} tintColor="#e6edf7" />
          }
        >
          {outgoingRequests.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Outgoing
              </Text>
              {outgoingRequests.map((item) => (
                <View key={item.requestId}>{renderOutgoingRequest({ item })}</View>
              ))}
            </View>
          ) : null}
          <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Incoming
          </Text>
          {incomingRequests.length === 0 ? (
            <Text className="py-6 text-center text-muted-foreground">
              No pending friend requests.
            </Text>
          ) : (
            incomingRequests.map((item) => (
              <View key={item.requestId}>{renderIncomingRequest({ item })}</View>
            ))
          )}
        </ScrollView>
      ) : null}

      {activeTab === "add" ? (
        <View className="min-h-0 flex-1">
          <TextInput
            className="mb-3 rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
            placeholder="Search by username"
            // uniwind-theme-allow mobile-theme/no-raw-color-prop - TextInput placeholderTextColor requires raw value; matches muted-foreground
            placeholderTextColor="#8b9cbb"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground */}
          {searchLoading ? <ActivityIndicator color="#e6edf7" /> : null}
          {searchError ? (
            <Text className="mb-2 text-sm text-destructive">{searchError}</Text>
          ) : null}
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.userId}
            renderItem={renderSearchResult}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              searchQuery.trim().length >= 2 ? (
                <Text className="py-4 text-center text-muted-foreground">No results.</Text>
              ) : (
                <Text className="py-4 text-center text-muted-foreground">
                  Type at least 2 characters to search.
                </Text>
              )
            }
          />
        </View>
      ) : null}

      {activeTab === "blocked" ? (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.blockedUserId}
          renderItem={renderBlocked}
          refreshing={refreshing}
          onRefresh={() => void refreshData({ suppressLoadingState: true })}
          ListEmptyComponent={
            <Text className="py-6 text-center text-muted-foreground">No blocked users.</Text>
          }
        />
      ) : null}
    </View>
  );
}
