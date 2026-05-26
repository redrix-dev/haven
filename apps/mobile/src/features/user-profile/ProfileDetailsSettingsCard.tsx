import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useHavenCore } from "@shared/core";
import type { ProfileVisibility } from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { ThemedIonicons } from "@/theme-rn";

const VISIBILITY_OPTIONS: Array<{
  value: ProfileVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only you can see your profile details.",
  },
  {
    value: "friends_only",
    label: "Friends",
    description: "Friends can see your profile details.",
  },
  {
    value: "public",
    label: "Public",
    description: "Reachable users can see your profile details.",
  },
];

type ProfileDetailsSettingsCardProps = {
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  profileVisibility: ProfileVisibility;
  profileBio: string | null;
};

export function ProfileDetailsSettingsCard({
  userId,
  username,
  avatarUrl,
  profileVisibility,
  profileBio,
}: ProfileDetailsSettingsCardProps) {
  const core = useHavenCore();
  const themeTokens = useMobileThemeTokens();
  const placeholderColor =
    resolveColorProp(themeTokens, "muted-foreground") ?? "#8E8E93";
  const [draftVisibility, setDraftVisibility] =
    useState<ProfileVisibility>(profileVisibility);
  const [draftBio, setDraftBio] = useState(profileBio ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftVisibility(profileVisibility);
  }, [profileVisibility]);

  useEffect(() => {
    setDraftBio(profileBio ?? "");
  }, [profileBio]);

  const dirty = useMemo(
    () =>
      draftVisibility !== profileVisibility ||
      draftBio.trim() !== (profileBio ?? "").trim(),
    [draftBio, draftVisibility, profileBio, profileVisibility],
  );

  const selectedOption = VISIBILITY_OPTIONS.find(
    (option) => option.value === draftVisibility,
  );

  const save = async () => {
    if (!userId || saving || !dirty) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      Alert.alert("Username required", "Set a username before saving profile details.");
      return;
    }

    setSaving(true);
    try {
      await core.updateUserProfile({
        userId,
        username: trimmedUsername,
        avatarUrl,
        profileVisibility: draftVisibility,
        profileBio: draftBio.trim().length > 0 ? draftBio.trim() : null,
      });
    } catch (error) {
      Alert.alert(
        "Could not save profile details",
        getErrorMessage(error, "Something went wrong. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Profile details
        </Text>
        <Text className="mt-1 text-xs leading-4 text-muted-foreground">
          {selectedOption?.description ?? "Choose who can see your profile details."}
        </Text>
      </View>

      <View className="gap-2 px-4 py-3">
        <View className="flex-row rounded-xl bg-muted p-1">
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = option.value === draftVisibility;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={saving}
                onPress={() => setDraftVisibility(option.value)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-2 py-2 ${
                  selected ? "bg-background" : ""
                }`}
              >
                {selected ? (
                  <ThemedIonicons
                    name="checkmark"
                    size={14}
                    colorClassName="accent-primary"
                  />
                ) : null}
                <Text
                  className={`text-center text-sm font-semibold ${
                    selected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-semibold text-muted-foreground">Bio</Text>
          <TextInput
            value={draftBio}
            onChangeText={setDraftBio}
            maxLength={500}
            multiline
            textAlignVertical="top"
            editable={!saving}
            placeholder="Add a short profile bio."
            placeholderTextColor={placeholderColor}
            className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
          />
          <Text className="text-right text-[11px] text-muted-foreground">
            {draftBio.length}/500
          </Text>
        </View>

        {dirty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save profile details"
            disabled={!userId || saving}
            onPress={() => void save()}
            className={`items-center justify-center rounded-xl py-2.5 ${
              userId && !saving ? "bg-primary" : "bg-muted opacity-70"
            }`}
          >
            <Text className="text-[15px] font-semibold text-primary-foreground">
              {saving ? "Saving..." : "Save details"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
