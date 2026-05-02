import { useMemo } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import type {
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";

type NotificationPreferencesPanelProps = {
  preferences: NotificationPreferences | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSave: (next: NotificationPreferenceUpdate) => Promise<void>;
};

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

export function NotificationPreferencesPanel({
  preferences,
  loading,
  saving,
  error,
  onSave,
}: NotificationPreferencesPanelProps) {
  const prefs = preferences;

  const groups = useMemo(() => {
    if (!prefs) return [];
    return [
      {
        title: "Friend requests",
        rows: [
          {
            key: "friendRequestInAppEnabled",
            label: "In-app",
            value: prefs.friendRequestInAppEnabled,
          },
          {
            key: "friendRequestSoundEnabled",
            label: "Sound",
            value: prefs.friendRequestSoundEnabled,
          },
          {
            key: "friendRequestPushEnabled",
            label: "Push",
            value: prefs.friendRequestPushEnabled,
          },
        ] as const,
      },
      {
        title: "Direct messages",
        rows: [
          { key: "dmInAppEnabled", label: "In-app", value: prefs.dmInAppEnabled },
          { key: "dmSoundEnabled", label: "Sound", value: prefs.dmSoundEnabled },
          { key: "dmPushEnabled", label: "Push", value: prefs.dmPushEnabled },
        ] as const,
      },
      {
        title: "Mentions",
        rows: [
          {
            key: "mentionInAppEnabled",
            label: "In-app",
            value: prefs.mentionInAppEnabled,
          },
          {
            key: "mentionSoundEnabled",
            label: "Sound",
            value: prefs.mentionSoundEnabled,
          },
          {
            key: "mentionPushEnabled",
            label: "Push",
            value: prefs.mentionPushEnabled,
          },
        ] as const,
      },
    ];
  }, [prefs]);

  if (loading && !prefs) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color="#e6edf7" />
        <Text className="mt-3 text-sm text-muted-foreground">Loading preferences…</Text>
      </View>
    );
  }

  if (!prefs) {
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
                  void onSave(buildUpdateFromPreferences(prefs, { [row.key]: next }));
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
