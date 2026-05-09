// apps/mobile/src/features/user-profile/UserSettingsContainer.tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import { Alert, View } from "react-native";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@platform/lib/errors";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import UserAccountCard from "@/features/user-profile/UserAccountCard";
import AppUpdatesCard from "@/features/user-profile/AppUpdatesCard";
import DeleteAccountConfirmationModal from "@/features/user-profile/DeleteAccountConfirmationModal";
import UserSettingsCard from "@/features/user-profile/UserSettingsCard";
import { ThemeBuiltinPickerCard } from "@/features/user-profile/ThemeBuiltinPickerCard";
import { useCurrentUserIdentity } from "@/features/user-profile/useCurrentUserIdentity";
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
  const identity = useCurrentUserIdentity();

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

        const backend = getControlPlaneBackend();
        const result = await backend.updateUserProfile({
          userId,
          username,
          avatarUrl: identity.avatarUrl,
          avatarFile: body,
          avatarContentType: contentType,
        });

        useLiveProfilesStore.getState().upsertProfile({
          userId,
          username: result.username,
          avatarUrl: result.avatarUrl,
          updatedAt: new Date().toISOString(),
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
    [identity.avatarUrl, identity.userId, identity.username],
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
      const backend = getControlPlaneBackend();
      const result = await backend.updateUserProfile({
        userId,
        username: nextUsername,
        avatarUrl: identity.avatarUrl,
      });

      useLiveProfilesStore.getState().upsertProfile({
        userId,
        username: result.username,
        avatarUrl: result.avatarUrl,
        updatedAt: new Date().toISOString(),
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
  }, [draftUsername, identity.avatarUrl, identity.userId, identity.username]);

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
