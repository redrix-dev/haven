import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { useAuthStore } from "@shared/stores/authStore";
import type { UserProfileModalTarget } from "@/features/user-profile/UserProfileModal";
import UserProfileModal from "@/features/user-profile/UserProfileModal";
import { FriendsSurface } from "@/features/friends/FriendsSurface";
import type { MainStackParamList } from "@/navigation/types";
import { ThemedIonicons } from "@/theme-rn";

type Props = NativeStackScreenProps<MainStackParamList, "Friends">;

export function FriendsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [profileTarget, setProfileTarget] =
    useState<UserProfileModalTarget | null>(null);

  const handleOpenDmWithUser = useCallback(
    async (targetUserId: string) => {
      const conversationId = await core.directMessages.openWithUser(targetUserId);
      navigation.navigate("Community", {
        pendingDmConversationId: conversationId,
        serverId: null,
        openDrawer: false,
      });
    },
    [core.directMessages, navigation],
  );

  const handleStartDirectMessage = useCallback(
    (targetUserId: string) => {
      setProfileTarget(null);
      void handleOpenDmWithUser(targetUserId).catch((error) => {
        Alert.alert(
          "Message failed",
          error instanceof Error
            ? error.message
            : "Could not open that conversation.",
        );
      });
    },
    [handleOpenDmWithUser],
  );

  return (
    <View className="flex-1 bg-background">
      <View
        style={{ paddingTop: insets.top }}
        className="border-b border-border-panel bg-surface-panel"
      >
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={navigation.goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="rounded-xl p-2 active:bg-surface-hover"
          >
            <ThemedIonicons
              name="chevron-back"
              size={24}
              colorClassName="accent-foreground"
            />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Friends</Text>
        </View>
      </View>

      <View className="min-h-0 flex-1 px-4 pt-4">
        <FriendsSurface
          userId={userId}
          initialTab={route.params?.initialTab ?? "friends"}
          highlightedRequestId={route.params?.highlightedRequestId ?? null}
          onStartDirectMessage={handleStartDirectMessage}
          onOpenProfile={setProfileTarget}
        />
      </View>

      <UserProfileModal
        visible={Boolean(profileTarget)}
        target={profileTarget}
        onDismiss={() => setProfileTarget(null)}
        onStartDirectMessage={handleStartDirectMessage}
      />
    </View>
  );
}
