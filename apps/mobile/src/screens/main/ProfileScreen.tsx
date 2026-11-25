import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ThemedIonicons } from "@/theme-rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useAvatarUrl, useHavenCore, useMe, useStore } from "@mobile-data";
import UserAccountCard from "@/features/user-profile/UserAccountCard";
import { ProfileDetailsSettingsCard } from "@/features/user-profile/ProfileDetailsSettingsCard";
import { loadPickedAvatarForUpload } from "@/features/user-profile/loadPickedAvatarForUpload";
import {
  useProfileAvatarPicker,
  type PickedAvatarAsset,
} from "@/features/user-profile/useProfileAvatarPicker";
import type { MainStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Profile">;

/** The person's own name and picture, details and privacy. */
export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const core = useHavenCore();
  const userId = useMe();
  const username = useStore("profiles", (s) =>
    userId ? (s.byId[userId]?.username ?? "") : "",
  );
  const avatarUrl = useAvatarUrl(userId);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (userId) void core.profiles.ensure([userId]);
    void core.client.auth
      .getSession()
      .then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, [core, userId]);

  const [draftUsername, setDraftUsername] = useState(username);
  const [isUsernameDirty, setIsUsernameDirty] = useState(false);
  const [pendingAvatarPreviewUri, setPendingAvatarPreviewUri] = useState<
    string | null
  >(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  useEffect(() => {
    if (!isUsernameDirty) setDraftUsername(username);
  }, [username, isUsernameDirty]);

  const handleAvatarPicked = useCallback(
    async (asset: PickedAvatarAsset) => {
      setPendingAvatarPreviewUri(asset.uri);
      try {
        const { body, contentType } = await loadPickedAvatarForUpload(asset);
        if (body.byteLength <= 0)
          throw new Error("Prepared image is empty; try another photo.");
        await core.setAvatar({
          body,
          mime_type: contentType,
          size_bytes: body.byteLength,
        });
      } catch (err) {
        Alert.alert(
          "Upload failed",
          getErrorMessage(err, "Could not save your profile photo. Try again."),
        );
      } finally {
        setPendingAvatarPreviewUri(null);
      }
    },
    [core],
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
    if (nextUsername === username.trim()) {
      setIsUsernameDirty(false);
      setIsEditingName(false);
      return;
    }
    setIsSavingAccount(true);
    try {
      await core.updateProfile({ username: nextUsername });
      setIsUsernameDirty(false);
      setIsEditingName(false);
    } catch (error) {
      Alert.alert(
        "Save failed",
        getErrorMessage(error, "Could not save your username."),
      );
    } finally {
      setIsSavingAccount(false);
    }
  }, [core, draftUsername, username]);

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
          <Text className="text-lg font-semibold text-foreground">Profile</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: insets.bottom + 16,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <UserAccountCard
          email={email}
          displayUsername={username}
          inputUsername={draftUsername}
          avatarUrl={pendingAvatarPreviewUri ?? avatarUrl}
          isEditingName={isEditingName}
          isSaving={isSavingAccount || isPicking}
          onPressEditName={() => {
            if (!isUsernameDirty) setDraftUsername(username);
            setIsEditingName(true);
          }}
          onPressCancelEditName={() => {
            setDraftUsername(username);
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

        <ProfileDetailsSettingsCard />

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Settings")}
          className="flex-row items-center justify-between rounded-2xl bg-surface-card-deep px-4 py-4 active:bg-surface-hover"
        >
          <View className="flex-row items-center gap-3">
            <ThemedIonicons
              name="settings-outline"
              size={20}
              colorClassName="accent-muted-foreground"
            />
            <Text className="text-base font-medium text-foreground">
              Settings
            </Text>
          </View>
          <ThemedIonicons
            name="chevron-forward"
            size={16}
            colorClassName="accent-muted-foreground"
          />
        </Pressable>
      </ScrollView>
    </View>
  );
}
