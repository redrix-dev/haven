import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { Audience } from "@shared/lib/backend/records";
import {
  activeFlair,
  usableFlairs,
} from "@shared/collections/account/selectors";
import {
  AUDIENCE_LABELS,
  PRIVACY_RULE_ORDER,
  PRIVACY_RULES,
  type PrivacyRule,
} from "@shared/features/profile/privacyRules";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import { useHavenCore, useStore } from "@mobile-data";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { UserFlairBadgePill } from "./UserFlairBadgePill";

/**
 * The person's bio and flair, and the three privacy rules: who sees those
 * details, who can start a conversation, who can send a friend request. The
 * database applies the rules; each change is saved as it is made.
 */
export function ProfileDetailsSettingsCard() {
  const core = useHavenCore();
  const tokens = useMobileThemeTokens();
  const placeholder = resolveColorProp(tokens, "muted-foreground") ?? "#8b9cbb";
  const savedBio = useStore("account", (s) => s.profile?.bio ?? "");
  const flairs = useStore("account", (s) => usableFlairs(s));
  const shownFlair = useStore("account", (s) => activeFlair(s));
  const settings = useStore("account", (s) => s.settings);
  const [bio, setBio] = useState(savedBio);
  const [savingBio, setSavingBio] = useState(false);
  const [savingRule, setSavingRule] = useState<PrivacyRule | null>(null);

  useEffect(() => setBio(savedBio), [savedBio]);

  const fail = (title: string) => (error: unknown) =>
    Alert.alert(title, getErrorMessage(error, "Try again in a moment."));

  const saveBio = async () => {
    setSavingBio(true);
    try {
      await core.updateProfile({ bio: bio.trim() });
    } catch (error) {
      fail("Couldn't save your bio")(error);
    } finally {
      setSavingBio(false);
    }
  };

  const setRule = async (rule: PrivacyRule, audience: Audience) => {
    setSavingRule(rule);
    try {
      await core.account.updateSettings({ [rule]: audience });
    } catch (error) {
      fail("Couldn't save that")(error);
    } finally {
      setSavingRule(null);
    }
  };

  return (
    <View className="gap-4 rounded-2xl bg-surface-card-deep p-4">
      <View>
        <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
          Bio
        </Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="A little about you"
          placeholderTextColor={placeholder}
          multiline
          maxLength={500}
          className="min-h-22 rounded-xl border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
        />
        {bio.trim() !== savedBio.trim() ? (
          <Pressable
            accessibilityRole="button"
            disabled={savingBio}
            onPress={() => void saveBio()}
            className={`mt-2 self-end rounded-xl bg-primary px-4 py-2 ${savingBio ? "opacity-60" : ""}`}
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              {savingBio ? "Saving…" : "Save bio"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {flairs.length > 0 ? (
        <View>
          <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Flair
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: shownFlair === null }}
              onPress={() =>
                void core.account
                  .setActiveFlair(null)
                  .catch(fail("Couldn't change your flair"))
              }
              className={`rounded-full border px-3 py-1.5 ${
                shownFlair === null ? "border-primary" : "border-border-control"
              }`}
            >
              <Text className="text-xs text-foreground">None</Text>
            </Pressable>
            {flairs.map((held) => (
              <Pressable
                key={held.flair_id}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: shownFlair?.flair_id === held.flair_id,
                }}
                onPress={() =>
                  void core.account
                    .setActiveFlair(held.flair_id)
                    .catch(fail("Couldn't change your flair"))
                }
                className={`rounded-full border-2 ${
                  shownFlair?.flair_id === held.flair_id
                    ? "border-primary"
                    : "border-transparent"
                }`}
              >
                <UserFlairBadgePill flair={held.flair} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Text className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Privacy
        </Text>
        {PRIVACY_RULE_ORDER.map((rule) => {
          const meta = PRIVACY_RULES[rule];
          const current = settings?.[rule] ?? null;
          return (
            <View key={rule} className="mt-3">
              <Text className="text-sm font-medium text-foreground">
                {meta.label}
              </Text>
              <Text className="mb-2 mt-0.5 text-xs text-muted-foreground">
                {meta.description}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {meta.audiences.map((audience) => (
                  <Pressable
                    key={audience}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: current === audience }}
                    disabled={savingRule !== null}
                    onPress={() => void setRule(rule, audience)}
                    className={`rounded-full border px-3 py-1.5 ${
                      current === audience
                        ? "border-primary bg-surface-panel"
                        : "border-border-control"
                    } ${savingRule === rule ? "opacity-60" : ""}`}
                  >
                    <Text className="text-xs text-foreground">
                      {AUDIENCE_LABELS[audience]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
