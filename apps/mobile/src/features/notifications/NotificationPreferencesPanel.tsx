import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import type {
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import {
  useNotificationPreferences,
  useNotificationPreferencesLoading,
  useNotificationPreferencesSaving,
} from "@mobile-data/hooks";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";

function buildUpdateFromPreferences(
  prefs: NotificationPreferences,
  patch: Partial<NotificationPreferenceUpdate>,
): NotificationPreferenceUpdate {
  return {
    friendRequestInAppEnabled: patch.friendRequestInAppEnabled ?? prefs.friendRequestInAppEnabled,
    friendRequestSoundEnabled: patch.friendRequestSoundEnabled ?? prefs.friendRequestSoundEnabled,
    friendRequestPushEnabled: patch.friendRequestPushEnabled ?? prefs.friendRequestPushEnabled,
    dmInAppEnabled: patch.dmInAppEnabled ?? prefs.dmInAppEnabled,
    dmSoundEnabled: patch.dmSoundEnabled ?? prefs.dmSoundEnabled,
    dmPushEnabled: patch.dmPushEnabled ?? prefs.dmPushEnabled,
    mentionInAppEnabled: patch.mentionInAppEnabled ?? prefs.mentionInAppEnabled,
    mentionSoundEnabled: patch.mentionSoundEnabled ?? prefs.mentionSoundEnabled,
    mentionPushEnabled: patch.mentionPushEnabled ?? prefs.mentionPushEnabled,
  };
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  switchColors,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  switchColors: { false: string; true: string; thumb: string };
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border-panel py-3">
      <View className="max-w-[72%] shrink">
        <Text className="text-base text-foreground">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      <Switch
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: switchColors.false, true: switchColors.true }}
        thumbColor={switchColors.thumb}
      />
    </View>
  );
}

export function NotificationPreferencesPanel() {
  const core = useHavenCore();
  const inbox = core.notifications;
  const themeTokens = useMobileThemeTokens();
  const foregroundColor = resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const switchColors = useMemo(
    () => ({
      false: resolveColorProp(themeTokens, "border-panel") ?? "#3d4f6a",
      true: resolveColorProp(themeTokens, "primary") ?? "#4f8df5",
      thumb: foregroundColor,
    }),
    [foregroundColor, themeTokens],
  );

  const preferences = useNotificationPreferences(inbox);
  const loading = useNotificationPreferencesLoading(inbox);
  const saving = useNotificationPreferencesSaving(inbox);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void inbox.ensurePreferences().catch((error) => {
      setError(getErrorMessage(error, "Failed to load notification preferences."));
    });
  }, [inbox]);

  const onSave = async (values: NotificationPreferenceUpdate) => {
    setError(null);
    try {
      await inbox.savePreferences(values);
    } catch (error) {
      setError(getErrorMessage(error, "Failed to save notification preferences."));
    }
  };

  const groups = useMemo(() => {
    if (!preferences) return [];
    return [
      {
        title: "Friend requests",
        rows: [
          {
            key: "friendRequestInAppEnabled",
            label: "In-app",
            value: preferences.friendRequestInAppEnabled,
          },
          {
            key: "friendRequestSoundEnabled",
            label: "Sound",
            value: preferences.friendRequestSoundEnabled,
          },
          {
            key: "friendRequestPushEnabled",
            label: "Push",
            value: preferences.friendRequestPushEnabled,
          },
        ] as const,
      },
      {
        title: "Direct messages",
        rows: [
          { key: "dmInAppEnabled", label: "In-app", value: preferences.dmInAppEnabled },
          { key: "dmSoundEnabled", label: "Sound", value: preferences.dmSoundEnabled },
          { key: "dmPushEnabled", label: "Push", value: preferences.dmPushEnabled },
        ] as const,
      },
      {
        title: "Mentions",
        rows: [
          {
            key: "mentionInAppEnabled",
            label: "In-app",
            value: preferences.mentionInAppEnabled,
          },
          {
            key: "mentionSoundEnabled",
            label: "Sound",
            value: preferences.mentionSoundEnabled,
          },
          {
            key: "mentionPushEnabled",
            label: "Push",
            value: preferences.mentionPushEnabled,
          },
        ] as const,
      },
    ];
  }, [preferences]);

  if (loading && !preferences) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={foregroundColor} />
        <Text className="mt-3 text-sm text-muted-foreground">Loading preferences…</Text>
      </View>
    );
  }

  if (!preferences) {
    return (
      <Text className="text-sm text-muted-foreground">
        Preferences could not be loaded.
      </Text>
    );
  }

  return (
    <View>
      {error ? (
        <Text className="mb-3 text-sm text-destructive">{error}</Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.title} className="mb-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </Text>
          <View className="rounded-xl border border-border-panel bg-surface-panel px-3">
            {group.rows.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                value={row.value}
                disabled={saving}
                switchColors={switchColors}
                onValueChange={(next) => {
                  void onSave(buildUpdateFromPreferences(preferences, { [row.key]: next }));
                }}
              />
            ))}
          </View>
        </View>
      ))}
      {saving ? (
        <Text className="text-center text-xs text-muted-foreground">Saving…</Text>
      ) : null}
    </View>
  );
}
