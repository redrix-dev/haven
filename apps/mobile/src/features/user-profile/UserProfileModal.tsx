import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { useHavenCore } from "@shared/core";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { ThemedIonicons } from "@/theme-rn";

export type UserProfileModalTarget = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

type UserProfileModalProps = {
  visible: boolean;
  target: UserProfileModalTarget | null;
  onDismiss: () => void;
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
}: UserProfileModalProps) {
  const core = useHavenCore();
  const liveProfiles = core.profiles.useProfilesRecord();
  const profileCard = core.profiles.useProfileCard(target?.userId);
  const loading = core.profiles.useProfileCardLoading(target?.userId);
  const error = core.profiles.useProfileCardError(target?.userId);

  useEffect(() => {
    if (!visible || !target?.userId) return;
    void core.profiles.loadProfileCard(target.userId).catch(() => {
      // The modal renders a local error state; no global alert needed.
    });
  }, [core.profiles, target?.userId, visible]);

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

  const detailsBody = useMemo(() => {
    if (!target) return null;
    if (loading && !profileCard) {
      return (
        <View className="items-center justify-center py-6">
          <ActivityIndicator />
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
  }, [error, loading, profileCard, target]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
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
          </View>

          <View className="mt-6 rounded-2xl border border-border bg-card p-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Details
            </Text>
            {detailsBody}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
