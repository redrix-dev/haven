import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useHavenCore } from "@mobile-data";
import {
  useUserFlairGrantError,
  useUserFlairGrantLoading,
  useUserFlairGrants,
} from "@mobile-data/hooks";
import type {
  ProfileVisibility,
  UserFlairGrant,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { ThemedIonicons } from "@/theme-rn";
import { UserFlairBadgePill } from "./UserFlairBadgePill";

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
    resolveColorProp(themeTokens, "muted-foreground") ?? "#8b9cbb";
  const [draftVisibility, setDraftVisibility] =
    useState<ProfileVisibility>(profileVisibility);
  const [draftBio, setDraftBio] = useState(profileBio ?? "");
  const [saving, setSaving] = useState(false);
  const [savingFlairId, setSavingFlairId] = useState<string | null>(null);
  const flairGrants = useUserFlairGrants(core.profiles, userId);
  const flairLoading = useUserFlairGrantLoading(core.profiles, userId);
  const flairError = useUserFlairGrantError(core.profiles, userId);

  useEffect(() => {
    setDraftVisibility(profileVisibility);
  }, [profileVisibility]);

  useEffect(() => {
    setDraftBio(profileBio ?? "");
  }, [profileBio]);

  useEffect(() => {
    if (!userId) return;
    void core.profiles.ensureMyUserFlairs(userId).catch(() => {
      // The card renders the local flair error state.
    });
  }, [core.profiles, userId]);

  const dirty = useMemo(
    () =>
      draftVisibility !== profileVisibility ||
      draftBio.trim() !== (profileBio ?? "").trim(),
    [draftBio, draftVisibility, profileBio, profileVisibility],
  );

  const selectedOption = VISIBILITY_OPTIONS.find(
    (option) => option.value === draftVisibility,
  );

  const selectedFlair = flairGrants.find((grant) => grant.isSelected) ?? null;

  const selectFlair = async (grant: UserFlairGrant | null) => {
    if (!userId || savingFlairId !== null) return;
    if (grant && (!grant.isAvailable || grant.isSelected)) return;
    if (!grant && !selectedFlair) return;

    setSavingFlairId(grant?.userFlairId ?? "none");
    try {
      await core.setActiveUserFlair(userId, grant?.userFlairId ?? null);
    } catch (error) {
      Alert.alert(
        "Could not update flair",
        getErrorMessage(error, "Something went wrong. Try again."),
      );
    } finally {
      setSavingFlairId(null);
    }
  };

  const save = async () => {
    if (!userId || saving || !dirty) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      Alert.alert(
        "Username required",
        "Set a username before saving profile details.",
      );
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
    <View className="overflow-hidden rounded-2xl border border-border-panel bg-card">
      <View className="border-b border-border-panel px-4 py-3">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Profile details
        </Text>
        <Text className="mt-1 text-xs leading-4 text-muted-foreground">
          {selectedOption?.description ??
            "Choose who can see your profile details."}
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
          <Text className="text-xs font-semibold text-muted-foreground">
            Bio
          </Text>
          <TextInput
            value={draftBio}
            onChangeText={setDraftBio}
            maxLength={500}
            multiline
            textAlignVertical="top"
            editable={!saving}
            placeholder="Add a short profile bio."
            placeholderTextColor={placeholderColor}
            className="min-h-24 rounded-xl border border-border-control bg-surface-panel px-3 py-2.5 text-base text-foreground"
          />
          <Text className="text-right text-[11px] text-muted-foreground">
            {draftBio.length}/500
          </Text>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-muted-foreground">
              Profile flair
            </Text>
            {flairLoading ? (
              <Text className="text-[11px] text-muted-foreground">
                Loading...
              </Text>
            ) : null}
          </View>

          {flairError ? (
            <Text className="text-xs leading-4 text-destructive">
              Could not load flair choices.
            </Text>
          ) : null}

          {flairGrants.length === 0 && !flairLoading ? (
            <Text className="rounded-xl border border-dashed border-border-panel px-3 py-2 text-sm text-muted-foreground">
              No flair yet.
            </Text>
          ) : (
            <View className="gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedFlair === null }}
                disabled={savingFlairId !== null}
                onPress={() => void selectFlair(null)}
                className="flex-row items-center justify-between rounded-xl border border-border-control bg-surface-panel px-3 py-2.5 active:bg-surface-hover"
              >
                <Text className="text-sm font-medium text-foreground">
                  No flair
                </Text>
                {selectedFlair === null ? (
                  <ThemedIonicons
                    name="checkmark-circle"
                    size={18}
                    colorClassName="accent-primary"
                  />
                ) : null}
              </Pressable>

              {flairGrants.map((grant) => {
                const disabled =
                  savingFlairId !== null ||
                  !grant.isAvailable ||
                  grant.isSelected;
                return (
                  <Pressable
                    key={grant.userFlairId}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: !grant.isAvailable,
                      selected: grant.isSelected,
                    }}
                    disabled={disabled}
                    onPress={() => void selectFlair(grant)}
                    className={`flex-row items-center justify-between rounded-xl border border-border-control bg-surface-panel px-3 py-2.5 active:bg-surface-hover ${
                      grant.isAvailable ? "" : "opacity-60"
                    }`}
                  >
                    <View className="flex-1 gap-1">
                      <UserFlairBadgePill flair={grant} />
                      {grant.description ? (
                        <Text className="text-xs leading-4 text-muted-foreground">
                          {grant.description}
                        </Text>
                      ) : null}
                    </View>
                    {grant.isSelected ? (
                      <ThemedIonicons
                        name="checkmark-circle"
                        size={18}
                        colorClassName="accent-primary"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
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
