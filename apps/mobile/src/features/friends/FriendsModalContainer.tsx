import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useFriendsModalData } from "@/features/friends/useFriendsModalData";
import { useMobileSocialWorkspace } from "@/contexts/MobileSocialWorkspaceContext";

type FriendsModalContainerProps = {
  visible: boolean;
  userId: string | null;
  initialTab: FriendsPanelTab;
  highlightedRequestId: string | null;
  onStartDirectMessage: (friendUserId: string, displayLabel?: string) => void;
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
}: FriendsModalContainerProps) {
  const core = useHavenCore();
  const liveProfiles = core.profiles.useProfilesRecord();
  const [activeTab, setActiveTab] = useState<FriendsPanelTab>("friends");

  const {
    actions: { refreshSocialCounts },
  } = useMobileSocialWorkspace();

  const data = useFriendsModalData(visible, userId);

  useEffect(() => {
    if (visible) setActiveTab(initialTab);
  }, [initialTab, visible]);

  const incomingRequests = useMemo(
    () => data.requests.filter((r) => r.direction === "incoming"),
    [data.requests],
  );
  const outgoingRequests = useMemo(
    () => data.requests.filter((r) => r.direction === "outgoing"),
    [data.requests],
  );

  const labelForFriend = useCallback(
    (friend: FriendSummary) =>
      resolveLiveUsername(liveProfiles, friend.friendUserId, friend.username)?.trim() ||
      friend.username,
    [liveProfiles],
  );

  const renderFriend: ListRenderItem<FriendSummary> = useCallback(
    ({ item }) => (
      <View className="flex-row items-center justify-between border-b border-border py-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-medium text-foreground">{labelForFriend(item)}</Text>
          <Text className="text-xs text-muted-foreground">
            {item.mutualCommunityCount > 0
              ? `${item.mutualCommunityCount} mutual server${item.mutualCommunityCount === 1 ? "" : "s"}`
              : "No mutual servers"}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            className="rounded-lg bg-accent-slider px-3 py-2"
            onPress={() => onStartDirectMessage(item.friendUserId, labelForFriend(item))}
          >
            <Text className="text-xs font-semibold text-white">Message</Text>
          </Pressable>
          <Pressable
            className="rounded-lg bg-surface-panel px-3 py-2"
            onPress={() => {
              Alert.alert(
                "Remove friend",
                `Remove ${labelForFriend(item)} from your friends?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () =>
                      void data.runMutation(`remove:${item.friendUserId}`, async () => {
                        await data.core.social.removeFriend(item.friendUserId);
                      }),
                  },
                ],
              );
            }}
          >
            <Text className="text-xs text-foreground">Remove</Text>
          </Pressable>
        </View>
      </View>
    ),
    [data, labelForFriend, onStartDirectMessage],
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
            disabled={data.busyActionKey !== null}
            onPress={() =>
              void data.runMutation(`accept:${item.requestId}`, async () => {
                await data.core.social.acceptFriendRequest(item.requestId);
              })
            }
          >
            <Text className="text-xs font-semibold text-white">Accept</Text>
          </Pressable>
          <Pressable
            className="rounded-lg bg-surface-panel px-3 py-2"
            disabled={data.busyActionKey !== null}
            onPress={() =>
              void data.runMutation(`decline:${item.requestId}`, async () => {
                await data.core.social.declineFriendRequest(item.requestId);
              })
            }
          >
            <Text className="text-xs text-foreground">Decline</Text>
          </Pressable>
        </View>
      </View>
    ),
    [data, highlightedRequestId],
  );

  const renderOutgoingRequest = useCallback(
    ({ item }: { item: FriendRequestSummary }) => (
      <View className="flex-row items-center justify-between border-b border-border py-3">
        <Text className="text-base text-foreground">{item.recipientUsername}</Text>
        <Pressable
          className="rounded-lg bg-surface-panel px-3 py-2"
          disabled={data.busyActionKey !== null}
          onPress={() =>
            void data.runMutation(`cancel:${item.requestId}`, async () => {
              await data.core.social.cancelFriendRequest(item.requestId);
            })
          }
        >
          <Text className="text-xs text-foreground">Cancel</Text>
        </Pressable>
      </View>
    ),
    [data],
  );

  const renderBlocked: ListRenderItem<BlockedUserSummary> = useCallback(
    ({ item }) => (
      <View className="flex-row items-center justify-between border-b border-border py-3">
        <Text className="text-base text-foreground">{item.username}</Text>
        <Pressable
          className="rounded-lg bg-surface-panel px-3 py-2"
          disabled={data.busyActionKey !== null}
          onPress={() =>
            void data.runMutation(`unblock:${item.blockedUserId}`, async () => {
              await data.core.social.unblockUser(item.blockedUserId);
            })
          }
        >
          <Text className="text-xs text-foreground">Unblock</Text>
        </Pressable>
      </View>
    ),
    [data],
  );

  const renderSearchResult: ListRenderItem<FriendSearchResult> = useCallback(
    ({ item }) => {
      const busy =
        data.busyActionKey?.startsWith(`send:${item.username}`) ?? false;
      return (
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-base text-foreground">{item.username}</Text>
            <Text className="text-xs capitalize text-muted-foreground">{item.relationshipState}</Text>
          </View>
          {item.relationshipState === "none" ? (
            <Pressable
              className="rounded-lg bg-accent-slider px-3 py-2"
              disabled={busy || data.busyActionKey !== null}
              onPress={() =>
                void data.runMutation(
                  `send:${item.username}`,
                  async () => {
                    await data.core.social.sendFriendRequest(item.username);
                  },
                )
              }
            >
              <Text className="text-xs font-semibold text-white">Add</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [data],
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
                activeTab === tab.id ? "text-white" : "text-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "requests" && data.counts.incomingPendingRequestCount > 0
                ? ` (${data.counts.incomingPendingRequestCount})`
                : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {data.loadError ? (
        <Text className="mb-2 text-sm text-red-400">{data.loadError}</Text>
      ) : null}
      {data.actionError ? (
        <Text className="mb-2 text-sm text-red-400">{data.actionError}</Text>
      ) : null}

      {data.loading && !data.refreshing ? (
        <ActivityIndicator color="#e6edf7" />
      ) : null}

      {activeTab === "friends" ? (
        <FlatList
          data={data.friends}
          keyExtractor={(item) => item.friendUserId}
          renderItem={renderFriend}
          refreshing={data.refreshing}
          onRefresh={() => void data.refreshData({ suppressLoadingState: true })}
          ListEmptyComponent={
            <Text className="py-6 text-center text-muted-foreground">No friends yet.</Text>
          }
        />
      ) : null}

      {activeTab === "requests" ? (
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={data.refreshing}
              onRefresh={() => void data.refreshData({ suppressLoadingState: true })}
              tintColor="#e6edf7"
            />
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
            placeholderTextColor="#8b9cbb"
            value={data.searchQuery}
            onChangeText={data.setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {data.searchLoading ? <ActivityIndicator color="#e6edf7" /> : null}
          {data.searchError ? (
            <Text className="mb-2 text-sm text-red-400">{data.searchError}</Text>
          ) : null}
          <FlatList
            data={data.searchResults}
            keyExtractor={(item) => item.userId}
            renderItem={renderSearchResult}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              data.searchQuery.trim().length >= 2 ? (
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
          data={data.blockedUsers}
          keyExtractor={(item) => item.blockedUserId}
          renderItem={renderBlocked}
          refreshing={data.refreshing}
          onRefresh={() => void data.refreshData({ suppressLoadingState: true })}
          ListEmptyComponent={
            <Text className="py-6 text-center text-muted-foreground">No blocked users.</Text>
          }
        />
      ) : null}
    </View>
  );
}
