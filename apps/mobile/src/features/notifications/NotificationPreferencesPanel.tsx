import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import type {
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

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
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-3">
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
        trackColor={{ false: "#3d4f6a", true: "#4f8df5" }}
        thumbColor="#e6edf7"
      />
    </View>
  );
}

export function NotificationPreferencesPanel() {
  const core = useHavenCore();
  const inbox = core.notifications;

  const preferences = inbox.usePreferences();
  const loading = inbox.usePreferencesLoading();
  const saving = inbox.usePreferencesSaving();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void inbox.loadPreferences().catch((error) => {
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
        <ActivityIndicator color="#e6edf7" />
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
        <Text className="mb-3 text-sm text-red-400">{error}</Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.title} className="mb-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </Text>
          <View className="rounded-xl border border-border bg-surface-panel px-3">
            {group.rows.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                value={row.value}
                disabled={saving}
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
