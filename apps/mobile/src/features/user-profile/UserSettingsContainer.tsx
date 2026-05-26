// apps/mobile/src/features/user-profile/UserSettingsContainer.tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import { Alert, View } from "react-native";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore } from "@shared/core";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@shared/stores/authStore";
import UserAccountCard from "@/features/user-profile/UserAccountCard";
import AppUpdatesCard from "@/features/user-profile/AppUpdatesCard";
import DeleteAccountConfirmationModal from "@/features/user-profile/DeleteAccountConfirmationModal";
import UserSettingsCard from "@/features/user-profile/UserSettingsCard";
import { ProfileDetailsSettingsCard } from "@/features/user-profile/ProfileDetailsSettingsCard";
import { ThemeBuiltinPickerCard } from "@/features/user-profile/ThemeBuiltinPickerCard";
import { loadPickedAvatarForUpload } from "@/features/user-profile/loadPickedAvatarForUpload";
import {
  useProfileAvatarPicker,
  type PickedAvatarAsset,
} from "@/features/user-profile/useProfileAvatarPicker";

type UserSettingsContainerProps = {
  onSignOut?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;
};

export default function UserSettingsContainer({
  onSignOut,
  onDeleteAccount,
}: UserSettingsContainerProps) {
  const core = useHavenCore();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;
  const viewerProfile = core.profiles.useViewerProfile(userId);
  const loadingBaseProfile = core.profiles.useViewerProfileLoading(userId);
  const liveProfiles = core.profiles.useProfilesRecord();
  const identity = useMemo(() => {
    const email = user?.email ?? null;
    const emailLocalPart = email?.split("@")[0]?.trim() ?? "";
    const fallbackUsername =
      (viewerProfile?.username ?? emailLocalPart) || "User";
    const username =
      resolveLiveUsername(liveProfiles, userId, fallbackUsername) ?? fallbackUsername;
    const avatarUrl =
      resolveLiveAvatarUrl(liveProfiles, userId, viewerProfile?.avatarUrl ?? null) ??
      viewerProfile?.avatarUrl ??
      null;

    return {
      userId,
      email,
      username,
      avatarUrl,
      avatarInitial: username.trim().charAt(0).toUpperCase() || "U",
      loadingBaseProfile,
    };
  }, [liveProfiles, loadingBaseProfile, user?.email, userId, viewerProfile]);

  const [draftUsername, setDraftUsername] = useState(identity.username);
  const [isUsernameDirty, setIsUsernameDirty] = useState(false);
  /** Local file URI while an avatar upload is in progress (immediate preview). */
  const [pendingAvatarPreviewUri, setPendingAvatarPreviewUri] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void core.profiles.loadViewerProfile(userId).catch(() => {
      // The card has graceful auth/email fallbacks; keep settings usable.
    });
  }, [core.profiles, userId]);

  useEffect(() => {
    if (!isUsernameDirty) {
      setDraftUsername(identity.username);
    }
  }, [identity.username, isUsernameDirty]);

  const previewAvatarUrl = pendingAvatarPreviewUri ?? identity.avatarUrl;

  const handleAvatarPicked = useCallback(
    async (asset: PickedAvatarAsset) => {
      const userId = identity.userId;
      if (!userId) {
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
        if (body.byteLength <= 0) {
          throw new Error("Prepared image is empty; try another photo.");
        }

        await core.updateUserProfile({
          userId,
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

  const { pickAvatar, isPicking } = useProfileAvatarPicker({
    onPicked: handleAvatarPicked,
  });

  const handleSaveAccount = useCallback(async () => {
    const nextUsername = draftUsername.trim();
    if (!nextUsername) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }

    const userId = identity.userId;
    if (!userId) {
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
        userId,
        username: nextUsername,
        avatarUrl: identity.avatarUrl,
      });

      setIsUsernameDirty(false);
      setIsEditingName(false);
    } catch (error) {
      Alert.alert(
        "Save failed",
        getErrorMessage(error, "Could not save account settings."),
      );
    } finally {
      setIsSavingAccount(false);
    }
  }, [core, draftUsername, identity.avatarUrl, identity.userId, identity.username]);

  const handleSignOut = useCallback(async () => {
    if (!onSignOut) return;
    setIsSigningOut(true);
    try {
      await onSignOut();
    } catch (error) {
      Alert.alert(
        "Sign out failed",
        getErrorMessage(error, "Something went wrong while signing out. Try again."),
      );
    } finally {
      setIsSigningOut(false);
    }
  }, [onSignOut]);

  const openDeleteAccountModal = useCallback(() => {
    setDeleteAccountModalVisible(true);
  }, []);

  const confirmDeleteAccount = useCallback(async () => {
    if (!onDeleteAccount) return;
    setIsDeletingAccount(true);
    try {
      await onDeleteAccount();
      setDeleteAccountModalVisible(false);
    } catch (error) {
      Alert.alert(
        "Delete failed",
        getErrorMessage(error, "Could not delete your account. Try again later."),
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }, [onDeleteAccount]);

  const settingsRows = useMemo(
    () => [
      {
        id: "signout",
        label: isSigningOut ? "Signing Out..." : "Sign Out",
        icon: "log-out-outline" as const,
        onPress: handleSignOut,
        disabled: isSigningOut || !onSignOut,
      },
      {
        id: "delete",
        label: isDeletingAccount ? "Deleting..." : "Delete Account",
        subtitle: "Permanently remove your account",
        icon: "trash-outline" as const,
        danger: true,
        onPress: openDeleteAccountModal,
        disabled: isDeletingAccount || !onDeleteAccount,
      },
    ],
    [
      openDeleteAccountModal,
      handleSignOut,
      isDeletingAccount,
      isSigningOut,
      onDeleteAccount,
      onSignOut,
    ],
  );

  return (
    <View className="flex-1 bg-card">
      <UserAccountCard
        email={identity.email}
        displayUsername={identity.username}
        inputUsername={draftUsername}
        avatarUrl={previewAvatarUrl}
        isEditingName={isEditingName}
        isSaving={isSavingAccount || isPicking}
        onPressEditName={() => {
          if (!isUsernameDirty) {
            setDraftUsername(identity.username);
          }
          setIsEditingName(true);
        }}
        onPressCancelEditName={() => {
          setDraftUsername(identity.username);
          setIsUsernameDirty(false);
          setIsEditingName(false);
        }}
        onPressAvatar={() => {
          void pickAvatar();
        }}
        onPressSave={handleSaveAccount}
        onChangeUsername={(next) => {
          setIsUsernameDirty(true);
          setDraftUsername(next);
        }}
      />
      <View className="gap-3 mt-3">
        <ProfileDetailsSettingsCard
          userId={identity.userId}
          username={identity.username}
          avatarUrl={identity.avatarUrl}
          profileVisibility={viewerProfile?.profileVisibility ?? "private"}
          profileBio={viewerProfile?.profileBio ?? null}
        />
        <ThemeBuiltinPickerCard
          userId={identity.userId}
          username={identity.username}
          avatarUrl={identity.avatarUrl}
        />
        <AppUpdatesCard />
        <UserSettingsCard rows={settingsRows} />
      </View>
      <DeleteAccountConfirmationModal
        visible={deleteAccountModalVisible}
        onDismiss={() => setDeleteAccountModalVisible(false)}
        onConfirmDelete={confirmDeleteAccount}
        isDeleting={isDeletingAccount}
      />
    </View>
  );
}
