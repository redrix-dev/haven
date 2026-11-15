import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import type { Community } from "@shared/lib/backend/records";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore, useMe, useStore } from "@mobile-data";
import {
  ErrorText,
  SettingsButton,
  SettingsField,
  SettingsToggle,
} from "./settingsUi";

/**
 * The community's name, description and defaults, for those who may manage
 * it; and the way out for everyone: the owner deletes it, anyone else leaves.
 */
export function OverviewSection({
  communityId,
  onDone,
}: {
  communityId: string;
  onDone: () => void;
}) {
  const core = useHavenCore();
  const me = useMe();
  const community = useStore("communities", (s) => s.byId[communityId] ?? null);
  const canManage = useStore("communities", () =>
    core.communities.can(communityId, "manage_community"),
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = community?.owner_id === me;

  const remove = () => {
    const deleting = isOwner;
    Alert.alert(
      deleting ? "Delete this community?" : "Leave this community?",
      deleting
        ? "This permanently removes the community for everyone and cannot be undone."
        : "You will lose access immediately and need a new invite to return.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: deleting ? "Delete community" : "Leave community",
          style: "destructive",
          onPress: () => {
            setWorking(true);
            setError(null);
            void (
              deleting
                ? core.communities.remove(communityId)
                : core.communities.leave(communityId)
            )
              .then(onDone)
              .catch((cause: unknown) =>
                setError(
                  getErrorMessage(
                    cause,
                    `Couldn't ${deleting ? "delete" : "leave"} the community.`,
                  ),
                ),
              )
              .finally(() => setWorking(false));
          },
        },
      ],
    );
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <ErrorText message={error} />
      {canManage && community ? (
        <GeneralSettings key={community.updated_at} community={community} />
      ) : null}
      <View className="mt-4 rounded-xl border border-destructive/40 p-4">
        <Text className="font-semibold text-foreground">
          {isOwner ? "Delete community" : "Leave community"}
        </Text>
        <Text className="mb-3 mt-1 text-sm text-muted-foreground">
          {isOwner
            ? "Permanently remove this community and its content for everyone. To leave it instead, hand it to another member first."
            : "Remove this community from your list. You'll need another invite to return."}
        </Text>
        <SettingsButton
          label={isOwner ? "Delete community" : "Leave community"}
          tone="destructive"
          disabled={working}
          onPress={remove}
        />
      </View>
    </ScrollView>
  );
}

function GeneralSettings({ community }: { community: Community }) {
  const core = useHavenCore();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [invitesEnabled, setInvitesEnabled] = useState(
    community.invites_enabled,
  );
  const [reasonRequired, setReasonRequired] = useState(
    community.report_reason_required,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setError("Community name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await core.communities.update(community.id, {
        name: nextName,
        description: description.trim(),
        invites_enabled: invitesEnabled,
        report_reason_required: reasonRequired,
      });
      Alert.alert("Community settings saved");
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save community settings."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <ErrorText message={error} />
      <SettingsField label="Name" value={name} onChangeText={setName} />
      <SettingsField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What brings this community together?"
        multiline
      />
      <SettingsToggle
        label="Invites work"
        description="Off: no invite to this community can be used, old or new."
        value={invitesEnabled}
        onValueChange={setInvitesEnabled}
        disabled={saving}
      />
      <SettingsToggle
        label="Require a report reason"
        description="Ask reporters to explain what moderators should review."
        value={reasonRequired}
        onValueChange={setReasonRequired}
        disabled={saving}
      />
      <View className="mt-2">
        <SettingsButton
          label={saving ? "Saving…" : "Save settings"}
          tone="primary"
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}
