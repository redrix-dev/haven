import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ThemedIonicons } from "@/theme-rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHavenCore } from "@shared/core";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@shared/stores/authStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import UserAccountCard from "@/features/user-profile/UserAccountCard";
import { ProfileDetailsSettingsCard } from "@/features/user-profile/ProfileDetailsSettingsCard";
import { loadPickedAvatarForUpload } from "@/features/user-profile/loadPickedAvatarForUpload";
import {
  useProfileAvatarPicker,
  type PickedAvatarAsset,
} from "@/features/user-profile/useProfileAvatarPicker";
import type { MainStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void core.profiles.loadViewerProfile(userId).catch(() => {});
  }, [core.profiles, userId]);

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
    return { userId, email, username, avatarUrl };
  }, [liveProfiles, user?.email, userId, viewerProfile]);

  const [draftUsername, setDraftUsername] = useState(identity.username);
  const [isUsernameDirty, setIsUsernameDirty] = useState(false);
  const [pendingAvatarPreviewUri, setPendingAvatarPreviewUri] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  useEffect(() => {
    if (!isUsernameDirty) {
      setDraftUsername(identity.username);
    }
  }, [identity.username, isUsernameDirty]);

  const previewAvatarUrl = pendingAvatarPreviewUri ?? identity.avatarUrl;

  const handleAvatarPicked = useCallback(
    async (asset: PickedAvatarAsset) => {
      if (!identity.userId) {
        Alert.alert("Not signed in", "Sign in to update your profile photo.");
        return;
      }
      const username = identity.username.trim();
      if (!username) {
        Alert.alert("Username missing", "Set a username before updating your photo.");
        return;
      }
      setPendingAvatarPreviewUri(asset.uri);
      try {
        const { body, contentType } = await loadPickedAvatarForUpload(asset);
        if (body.byteLength <= 0) throw new Error("Prepared image is empty; try another photo.");
        await core.updateUserProfile({
          userId: identity.userId,
          username,
          avatarUrl: identity.avatarUrl,
          avatarFile: body,
          avatarContentType: contentType,
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Could not save your profile photo. Try again.";
        Alert.alert("Upload failed", message);
      } finally {
        setPendingAvatarPreviewUri(null);
      }
    },
    [core, identity.avatarUrl, identity.userId, identity.username],
  );

  const { pickAvatar, isPicking } = useProfileAvatarPicker({ onPicked: handleAvatarPicked });

  const handleSaveAccount = useCallback(async () => {
    const nextUsername = draftUsername.trim();
    if (!nextUsername) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }
    if (!identity.userId) {
      Alert.alert("Not signed in", "Sign in to save your profile.");
      return;
    }
    if (nextUsername === identity.username.trim()) {
      setIsUsernameDirty(false);
      setIsEditingName(false);
      return;
    }
    setIsSavingAccount(true);
    try {
      await core.updateUserProfile({
        userId: identity.userId,
        username: nextUsername,
        avatarUrl: identity.avatarUrl,
      });
      setIsUsernameDirty(false);
      setIsEditingName(false);
    } catch (error) {
      Alert.alert("Save failed", getErrorMessage(error, "Could not save account settings."));
    } finally {
      setIsSavingAccount(false);
    }
  }, [core, draftUsername, identity.avatarUrl, identity.userId, identity.username]);

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
          <Text className="text-lg font-semibold text-foreground">Profile</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <UserAccountCard
          email={identity.email}
          displayUsername={identity.username}
          inputUsername={draftUsername}
          avatarUrl={previewAvatarUrl}
          isEditingName={isEditingName}
          isSaving={isSavingAccount || isPicking}
          onPressEditName={() => {
            if (!isUsernameDirty) setDraftUsername(identity.username);
            setIsEditingName(true);
          }}
          onPressCancelEditName={() => {
            setDraftUsername(identity.username);
            setIsUsernameDirty(false);
            setIsEditingName(false);
          }}
          onPressAvatar={() => { void pickAvatar(); }}
          onPressSave={handleSaveAccount}
          onChangeUsername={(next) => {
            setIsUsernameDirty(true);
            setDraftUsername(next);
          }}
        />

        <ProfileDetailsSettingsCard
          userId={identity.userId}
          username={identity.username}
          avatarUrl={identity.avatarUrl}
          profileVisibility={viewerProfile?.profileVisibility ?? "private"}
          profileBio={viewerProfile?.profileBio ?? null}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Settings")}
          className="flex-row items-center justify-between rounded-2xl bg-surface-card-deep px-4 py-4 active:bg-surface-hover"
        >
          <View className="flex-row items-center gap-3">
            <ThemedIonicons name="settings-outline" size={20} colorClassName="accent-muted-foreground" />
            <Text className="text-base font-medium text-foreground">Settings</Text>
          </View>
          <ThemedIonicons name="chevron-forward" size={16} colorClassName="accent-muted-foreground" />
        </Pressable>
      </ScrollView>
    </View>
  );
}
