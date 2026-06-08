import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { useHavenCore } from "@mobile-data";
import {
  useBlockedUsers,
  useFriendRequests,
  useFriends,
  useProfileCard,
  useProfileCardError,
  useProfileCardLoading,
  useProfilesRecord,
} from "@mobile-data/hooks";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@mobile-data/session/authStore";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { ThemedIonicons } from "@/theme-rn";
import { UserFlairBadgePill } from "./UserFlairBadgePill";
import { ProfileReportSheet } from "./ProfileReportSheet";

export type UserProfileModalTarget = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  sourceCommunityId?: string | null;
  sourceCommunityName?: string | null;
};

type UserProfileModalProps = {
  visible: boolean;
  target: UserProfileModalTarget | null;
  onDismiss: () => void;
  onStartDirectMessage: (userId: string) => void;
};

function privateDetailsCopy(profileVisibility: string | undefined): string {
  if (profileVisibility === "friends_only") {
    return "This user's account details are visible to friends only.";
  }
  return "This user's account details are private.";
}

export default function UserProfileModal({
  visible,
  target,
  onDismiss,
  onStartDirectMessage,
}: UserProfileModalProps) {
  const core = useHavenCore();
  const themeTokens = useMobileThemeTokens();
  const foregroundColor = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const liveProfiles = useProfilesRecord(core.profiles);
  const profileCard = useProfileCard(core.profiles, target?.userId);
  const loading = useProfileCardLoading(core.profiles, target?.userId);
  const error = useProfileCardError(core.profiles, target?.userId);
  const friends = useFriends(core.social);
  const requests = useFriendRequests(core.social);
  const blockedUsers = useBlockedUsers(core.social);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!visible || !target?.userId) return;
    void core.profiles.loadProfileCard(target.userId).catch(() => {
      // The modal renders a local error state; no global alert needed.
    });
    void core.social.ensureLoaded().catch(() => {
      // Social action buttons degrade gracefully until the next refresh.
    });
  }, [core.profiles, core.social, target?.userId, visible]);

  useEffect(() => {
    if (visible) return;
    setBusyAction(null);
    setActionError(null);
    setActionsOpen(false);
    setReportOpen(false);
  }, [visible]);

  const identity = useMemo(() => {
    const fallbackUsername = target?.username ?? "User";
    const username =
      (profileCard?.username?.trim() ? profileCard.username : null) ??
      resolveLiveUsername(liveProfiles, target?.userId, fallbackUsername) ??
      fallbackUsername;
    const avatarUrl =
      profileCard?.avatarUrl ??
      resolveLiveAvatarUrl(liveProfiles, target?.userId, target?.avatarUrl ?? null) ??
      target?.avatarUrl ??
      null;

    return {
      username,
      avatarUrl,
      initial: username.trim().charAt(0).toUpperCase() || "U",
    };
  }, [liveProfiles, profileCard, target]);

  const relationship = useMemo(() => {
    if (!target?.userId) {
      return {
        isSelf: false,
        isFriend: false,
        incomingRequestId: null as string | null,
        outgoingRequestId: null as string | null,
        isBlocked: false,
      };
    }

    return {
      isSelf: target.userId === viewerUserId,
      isFriend: friends.some((friend) => friend.friendUserId === target.userId),
      incomingRequestId:
        requests.find(
          (request) =>
            request.direction === "incoming" &&
            request.senderUserId === target.userId,
        )?.requestId ?? null,
      outgoingRequestId:
        requests.find(
          (request) =>
            request.direction === "outgoing" &&
            request.recipientUserId === target.userId,
        )?.requestId ?? null,
      isBlocked: blockedUsers.some(
        (blocked) => blocked.blockedUserId === target.userId,
      ),
    };
  }, [blockedUsers, friends, requests, target?.userId, viewerUserId]);

  const runSocialAction = useCallback(
    async (action: string, fn: () => Promise<void>) => {
      setBusyAction(action);
      setActionError(null);
      try {
        await fn();
        if (target?.userId) {
          await core.profiles.loadProfileCard(target.userId).catch(() => undefined);
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed.");
      } finally {
        setBusyAction(null);
      }
    },
    [core.profiles, target?.userId],
  );

  const handleAddFriend = useCallback(() => {
    if (!target) return;
    void runSocialAction("add", async () => {
      await core.social.sendFriendRequest(identity.username);
    });
  }, [core.social, identity.username, runSocialAction, target]);

  const handleAcceptFriend = useCallback(() => {
    if (!relationship.incomingRequestId) return;
    void runSocialAction("accept", async () => {
      await core.social.acceptFriendRequest(relationship.incomingRequestId!);
    });
  }, [core.social, relationship.incomingRequestId, runSocialAction]);

  const handleCancelFriendRequest = useCallback(() => {
    if (!relationship.outgoingRequestId) return;
    void runSocialAction("cancel", async () => {
      await core.social.cancelFriendRequest(relationship.outgoingRequestId!);
    });
  }, [core.social, relationship.outgoingRequestId, runSocialAction]);

  const handleRemoveFriend = useCallback(() => {
    if (!target) return;
    Alert.alert("Remove friend", `Remove ${identity.username} from your friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void runSocialAction("remove", async () => {
            await core.social.removeFriend(target.userId);
          }),
      },
    ]);
  }, [core.social, identity.username, runSocialAction, target]);

  const handleToggleBlock = useCallback(() => {
    if (!target) return;
    setActionsOpen(false);
    const nextAction = relationship.isBlocked ? "Unblock" : "Block";
    Alert.alert(
      `${nextAction} user`,
      `${nextAction} ${identity.username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextAction,
          style: relationship.isBlocked ? "default" : "destructive",
          onPress: () =>
            void runSocialAction(relationship.isBlocked ? "unblock" : "block", async () => {
              if (relationship.isBlocked) {
                await core.social.unblockUser(target.userId);
              } else {
                await core.social.blockUser(target.userId);
              }
            }),
        },
      ],
    );
  }, [core.social, identity.username, relationship.isBlocked, runSocialAction, target]);

  const canSendMessage =
    Boolean(target) &&
    !relationship.isSelf &&
    !relationship.isBlocked &&
    Boolean(profileCard?.canViewDetails);

  const handleStartDirectMessage = useCallback(() => {
    if (!target) return;
    onDismiss();
    onStartDirectMessage(target.userId);
  }, [onDismiss, onStartDirectMessage, target]);

  const submitProfileReport = useCallback(
    async (reason: string) => {
      if (!target || !viewerUserId) return;
      await core.reportUserProfile({
        communityId: target.sourceCommunityId ?? null,
        targetUserId: target.userId,
        reporterUserId: viewerUserId,
        reason,
      });
    },
    [core, target, viewerUserId],
  );

  const detailsBody = useMemo(() => {
    if (!target) return null;
    if (loading && !profileCard) {
      return (
        <View className="items-center justify-center py-6">
          <ActivityIndicator color={foregroundColor} />
        </View>
      );
    }
    if (error) {
      return (
        <Text className="text-sm leading-5 text-muted-foreground">
          Could not load profile details. Try again later.
        </Text>
      );
    }
    if (!profileCard) {
      return (
        <Text className="text-sm leading-5 text-muted-foreground">
          Profile details are unavailable.
        </Text>
      );
    }
    if (!profileCard.canViewDetails) {
      return (
        <Text className="text-sm leading-5 text-muted-foreground">
          {privateDetailsCopy(profileCard.profileVisibility)}
        </Text>
      );
    }

    const bio = profileCard.details?.bio?.trim();
    return (
      <Text className="text-sm leading-5 text-foreground">
        {bio || "No profile details yet."}
      </Text>
    );
  }, [error, foregroundColor, loading, profileCard, target]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border-panel px-4 py-3">
          <Text className="text-base font-semibold text-foreground">Profile</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            hitSlop={12}
            onPress={onDismiss}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
          >
            <ThemedIonicons name="close" size={22} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>

        <View className="px-5 py-6">
          <View className="items-center gap-3">
            {identity.avatarUrl ? (
              <Image
                source={{ uri: identity.avatarUrl }}
                className="h-24 w-24 rounded-full"
                accessibilityLabel={`${identity.username} avatar`}
              />
            ) : (
              <View className="h-24 w-24 items-center justify-center rounded-full bg-muted">
                <Text className="text-3xl font-semibold text-foreground">
                  {identity.initial}
                </Text>
              </View>
            )}
            <Text className="text-center text-xl font-semibold text-foreground">
              {identity.username}
            </Text>
            {profileCard?.details?.activeFlair ? (
              <UserFlairBadgePill
                flair={profileCard.details.activeFlair}
                align="center"
              />
            ) : null}
          </View>

          {!relationship.isSelf ? (
            <View className="mt-5 flex-row items-center justify-center gap-2">
              {relationship.isFriend ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busyAction !== null}
                  onPress={handleRemoveFriend}
                  className="rounded-xl bg-surface-panel px-4 py-2.5 active:bg-surface-hover"
                >
                  <Text className="text-sm font-semibold text-foreground">Remove Friend</Text>
                </Pressable>
              ) : relationship.incomingRequestId ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busyAction !== null}
                  onPress={handleAcceptFriend}
                  className="rounded-xl bg-primary px-4 py-2.5 active:bg-primary-hover"
                >
                  <Text className="text-sm font-semibold text-primary-foreground">
                    Respond
                  </Text>
                </Pressable>
              ) : relationship.outgoingRequestId ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busyAction !== null}
                  onPress={handleCancelFriendRequest}
                  className="rounded-xl bg-surface-panel px-4 py-2.5 active:bg-surface-hover"
                >
                  <Text className="text-sm font-semibold text-foreground">Requested</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={busyAction !== null || relationship.isBlocked}
                  onPress={handleAddFriend}
                  className={`rounded-xl px-4 py-2.5 ${
                    relationship.isBlocked ? "bg-muted opacity-60" : "bg-primary active:bg-primary-hover"
                  }`}
                >
                  <Text className="text-sm font-semibold text-primary-foreground">Add Friend</Text>
                </Pressable>
              )}

              {canSendMessage ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busyAction !== null}
                  onPress={handleStartDirectMessage}
                  className="rounded-xl bg-primary px-4 py-2.5 active:bg-primary-hover"
                >
                  <Text className="text-sm font-semibold text-primary-foreground">
                    Send Message
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More profile actions"
                hitSlop={8}
                onPress={() => setActionsOpen(true)}
                className="h-10 w-10 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
              >
                <ThemedIonicons
                  name="ellipsis-horizontal"
                  size={20}
                  colorClassName="accent-foreground"
                />
              </Pressable>
            </View>
          ) : null}

          {actionError ? (
            <Text className="mt-3 text-center text-sm text-destructive">{actionError}</Text>
          ) : null}

          <View className="mt-6 rounded-2xl border border-border-panel bg-card p-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Details
            </Text>
            {detailsBody}
          </View>
        </View>
      </SafeAreaView>
      <Modal
        visible={actionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsOpen(false)}
      >
        {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal sheet scrim overlay, invariant across themes */}
        <Pressable className="flex-1 justify-end bg-black/55" onPress={() => setActionsOpen(false)}>
          <Pressable
            className="rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-8 pt-3"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="mb-3 text-center text-xs text-muted-foreground" numberOfLines={2}>
              {identity.username}
            </Text>
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={() => {
                setActionsOpen(false);
                setReportOpen(true);
              }}
            >
              <Text className="text-center text-base font-medium text-foreground">Report</Text>
            </Pressable>
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={handleToggleBlock}
            >
              <Text
                className={`text-center text-base font-medium ${
                  relationship.isBlocked ? "text-foreground" : "text-destructive"
                }`}
              >
                {relationship.isBlocked ? "Unblock" : "Block"}
              </Text>
            </Pressable>
            <Pressable
              className="mt-1 rounded-xl py-3 active:opacity-90"
              onPress={() => setActionsOpen(false)}
            >
              <Text className="text-center text-base text-muted-foreground">Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <ProfileReportSheet
        visible={reportOpen}
        username={identity.username}
        destinationLabel={
          target?.sourceCommunityName
            ? `${target.sourceCommunityName} moderators and Haven staff`
            : "the Haven Moderation Team"
        }
        onClose={() => setReportOpen(false)}
        onSubmit={submitProfileReport}
      />
    </Modal>
  );
}
