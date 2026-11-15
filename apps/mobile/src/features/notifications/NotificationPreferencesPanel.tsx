import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { preferenceFor } from "@shared/collections/notifications/selectors";
import {
  OPTIONAL_NOTIFICATION_KINDS,
  type OptionalNotificationKind,
} from "@shared/features/notifications/notificationKinds";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore, useStore } from "@mobile-data";

const CHANNELS = [
  { key: "in_app", label: "In the app" },
  { key: "push", label: "Push to this phone" },
] as const;

/**
 * Which notifications the person gets, and how: in the app, or pushed to
 * the phone. Reports, decisions about them and notices from Haven always
 * arrive, so they are not listed. A change is saved as it is made.
 */
export function NotificationPreferencesPanel() {
  const core = useHavenCore();
  const kinds = Object.keys(
    OPTIONAL_NOTIFICATION_KINDS,
  ) as OptionalNotificationKind[];

  const set = (
    kind: OptionalNotificationKind,
    key: (typeof CHANNELS)[number]["key"],
    on: boolean,
  ) =>
    void core.notifications
      .setPreference(kind, {
        ...preferenceFor(core.stores.notifications.getState(), kind),
        [key]: on,
      })
      .catch((error: unknown) =>
        Alert.alert(
          "Couldn't save that",
          getErrorMessage(error, "Try again in a moment."),
        ),
      );

  return (
    <ScrollView>
      {kinds.map((kind) => (
        <PreferenceRow key={kind} kind={kind} onChange={set} />
      ))}
      <Text className="mt-4 text-xs leading-5 text-muted-foreground">
        Reports, moderation decisions and notices from Haven always arrive.
      </Text>
    </ScrollView>
  );
}

function PreferenceRow({
  kind,
  onChange,
}: {
  kind: OptionalNotificationKind;
  onChange: (
    kind: OptionalNotificationKind,
    key: (typeof CHANNELS)[number]["key"],
    on: boolean,
  ) => void;
}) {
  const values = useStore("notifications", (s) => preferenceFor(s, kind));
  const meta = OPTIONAL_NOTIFICATION_KINDS[kind];
  return (
    <View className="mb-3 rounded-xl bg-surface-panel p-4">
      <Text className="text-sm font-semibold text-foreground">
        {meta.label}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">
        {meta.description}
      </Text>
      {CHANNELS.map((channel) => (
        <View
          key={channel.key}
          className="mt-3 flex-row items-center justify-between"
        >
          <Text className="text-sm text-foreground">{channel.label}</Text>
          <Switch
            accessibilityLabel={`${meta.label}: ${channel.label}`}
            value={values[channel.key]}
            onValueChange={(on) => onChange(kind, channel.key, on)}
          />
        </View>
      ))}
    </View>
  );
}
