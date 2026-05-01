// apps/mobile/src/features/user-profile/UserSettingsContainer.tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import { Alert, View } from "react-native";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import UserAccountCard from "@/features/user-profile/UserAccountCard";
import UserSettingsCard from "@/features/user-profile/UserSettingsCard";
import { useCurrentUserIdentity } from "@/features/user-profile/useCurrentUserIdentity";
import { loadPickedAvatarBlob } from "@/features/user-profile/loadPickedAvatarBlob";
import {
  useProfileAvatarPicker,
  type PickedAvatarAsset,
} from "@/features/user-profile/useProfileAvatarPicker";

type UserSettingsContainerProps = {
  onOpenVoiceSettings?: () => void;
  onSignOut?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;
};

export default function UserSettingsContainer({
  onOpenVoiceSettings,
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
        const avatarFile = await loadPickedAvatarBlob(asset);
        if (avatarFile.size <= 0) {
          throw new Error("Prepared image is empty; try another photo.");
        }

        const backend = getControlPlaneBackend();
        const result = await backend.updateUserProfile({
          userId,
          username,
          avatarUrl: identity.avatarUrl,
          avatarFile,
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

    setIsSavingAccount(true);
    try {
      // TODO: wire username change to backend (updateUserProfile without avatarFile).
      Alert.alert("Saved", "Account settings saved (stub).");
      setIsUsernameDirty(false);
      setIsEditingName(false);
    } catch {
      Alert.alert("Save failed", "Could not save account settings.");
    } finally {
      setIsSavingAccount(false);
    }
  }, [draftUsername]);

  const handleSignOut = useCallback(async () => {
    if (!onSignOut) return;
    setIsSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [onSignOut]);

  const handleDeleteAccount = useCallback(async () => {
    if (!onDeleteAccount) return;
    Alert.alert("Delete account?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setIsDeletingAccount(true);
            try {
              await onDeleteAccount();
            } finally {
              setIsDeletingAccount(false);
            }
          })();
        },
      },
    ]);
  }, [onDeleteAccount]);

  const settingsRows = useMemo(
    () => [
      {
        id: "voice",
        label: "Voice Settings",
        subtitle: "Input/output and voice behavior",
        icon: "volume-high-outline" as const,
        onPress: onOpenVoiceSettings,
        disabled: !onOpenVoiceSettings,
      },
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
        onPress: handleDeleteAccount,
        disabled: isDeletingAccount || !onDeleteAccount,
      },
    ],
    [
      handleDeleteAccount,
      handleSignOut,
      isDeletingAccount,
      isSigningOut,
      onDeleteAccount,
      onOpenVoiceSettings,
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
      <View className="gap-3 mt-3"/>
      <UserSettingsCard rows={settingsRows} />
    </View>
  );
}