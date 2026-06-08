import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ThemedIonicons } from "@/theme-rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@mobile-data/session/authStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { deleteOwnAccount, signOutFromAuth } from "@/auth/mobileAuthService";
import { ThemeVisualPickerCard } from "@/features/user-profile/ThemeVisualPickerCard";
import AppUpdatesCard from "@/features/user-profile/AppUpdatesCard";
import DeleteAccountConfirmationModal from "@/features/user-profile/DeleteAccountConfirmationModal";
import type { MainStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  const viewerProfile = core.profiles.useViewerProfile(userId);
  const liveProfiles = core.profiles.useProfilesRecord();

  const identity = useMemo(() => {
    const email = user?.email ?? null;
    const emailLocalPart = email?.split("@")[0]?.trim() ?? "";
    const fallbackUsername = (viewerProfile?.username ?? emailLocalPart) || "User";
    const username =
      resolveLiveUsername(liveProfiles, userId, fallbackUsername) ?? fallbackUsername;
    const avatarUrl =
      resolveLiveAvatarUrl(liveProfiles, userId, viewerProfile?.avatarUrl ?? null) ??
      viewerProfile?.avatarUrl ??
      null;
    return { userId, username, avatarUrl };
  }, [liveProfiles, user?.email, userId, viewerProfile]);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOutFromAuth();
    } catch (error) {
      Alert.alert(
        "Sign out failed",
        getErrorMessage(error, "Something went wrong while signing out. Try again."),
      );
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  const confirmDeleteAccount = useCallback(async () => {
    setIsDeletingAccount(true);
    try {
      await deleteOwnAccount();
      setDeleteModalVisible(false);
    } catch (error) {
      Alert.alert(
        "Delete failed",
        getErrorMessage(error, "Could not delete your account. Try again later."),
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }} className="border-b border-border-panel bg-surface-panel">
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={navigation.goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="rounded-xl p-2 active:bg-surface-hover"
          >
            <ThemedIonicons name="chevron-back" size={24} colorClassName="accent-foreground" />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Settings</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
        keyboardDismissMode="interactive"
      >
        <ThemeVisualPickerCard
          userId={identity.userId}
          username={identity.username}
          avatarUrl={identity.avatarUrl}
        />

        <AppUpdatesCard />

        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void handleSignOut()}
            disabled={isSigningOut}
            className={`flex-row items-center gap-3 px-4 py-3.5 ${isSigningOut ? "opacity-50" : "opacity-100"} border-b border-border-panel`}
          >
            <ThemedIonicons name="log-out-outline" size={18} colorClassName="accent-muted-foreground" />
            <Text className="flex-1 text-base font-medium text-foreground">
              {isSigningOut ? "Signing out…" : "Sign Out"}
            </Text>
            <ThemedIonicons name="chevron-forward" size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            onPress={() => setDeleteModalVisible(true)}
            disabled={isDeletingAccount}
            className={`flex-row items-center gap-3 px-4 py-3.5 ${isDeletingAccount ? "opacity-50" : "opacity-100"}`}
          >
            <ThemedIonicons name="trash-outline" size={18} colorClassName="accent-destructive" />
            <View className="flex-1">
              <Text className="text-base font-medium text-destructive">
                {isDeletingAccount ? "Deleting…" : "Delete Account"}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                Permanently remove your account
              </Text>
            </View>
            <ThemedIonicons name="chevron-forward" size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </ScrollView>

      <DeleteAccountConfirmationModal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        onConfirmDelete={confirmDeleteAccount}
        isDeleting={isDeletingAccount}
      />
    </View>
  );
}
