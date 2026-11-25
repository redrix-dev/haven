import { useEffect, useState } from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import type { Invite } from "@shared/lib/backend/records";
import { invitesOf } from "@shared/collections/communities/selectors";
import { buildHavenLink } from "@shared/features/links";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore, useStore } from "@mobile-data";
import {
  Choices,
  ErrorText,
  Muted,
  SectionTitle,
  SettingsButton,
} from "./settingsUi";

const EXPIRY_OPTIONS: { label: string; value: number | null }[] = [
  { label: "1 hour", value: 1 },
  { label: "1 day", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
  { label: "Never", value: null },
];

const MAX_USES_OPTIONS: { label: string; value: number | null }[] = [
  { label: "No limit", value: null },
  { label: "1 use", value: 1 },
  { label: "10 uses", value: 10 },
  { label: "100 uses", value: 100 },
];

/** Always the canonical web link: it opens anywhere and the app picks it up. */
const inviteLink = (code: string) => buildHavenLink({ kind: "invite", code });

function describe(invite: Invite): string {
  const uses =
    invite.max_uses == null
      ? `${invite.uses} uses`
      : `${invite.uses} / ${invite.max_uses} uses`;
  const expires = invite.expires_at
    ? `expires ${new Date(invite.expires_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`
    : "never expires";
  return `${uses} · ${expires}`;
}

/** The community's invites, for those with `manage_invites`. */
export function InvitesSection({ communityId }: { communityId: string }) {
  const core = useHavenCore();
  const invites = useStore("communities", (s) => invitesOf(s, communityId));
  const status = useStore(
    "communities",
    (s) => s.requests[`invites:${communityId}`] ?? null,
  );
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [hours, setHours] = useState<number | null>(168);
  const [creating, setCreating] = useState(false);

  // Only the community is a dependency; loading writes the store.
  useEffect(() => {
    void core.communities.loadInvites(communityId);
  }, [communityId, core]);

  const share = (invite: Invite) =>
    void Share.share({ message: inviteLink(invite.code) }).catch(() => {});

  const create = async () => {
    setCreating(true);
    try {
      share(
        await core.communities.createInvite(communityId, {
          max_uses: maxUses,
          expires_in_hours: hours,
        }),
      );
    } catch (error) {
      Alert.alert(
        "Couldn't create invite",
        getErrorMessage(error, "Please try again."),
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = (invite: Invite) =>
    Alert.alert(
      "Revoke this invite?",
      "The link stops working immediately. Anyone who already joined stays.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () =>
            void core.communities
              .revokeInvite(communityId, invite.id)
              .catch((error: unknown) =>
                Alert.alert(
                  "Couldn't revoke invite",
                  getErrorMessage(error, "Please try again."),
                ),
              ),
        },
      ],
    );

  return (
    <ScrollView>
      <SectionTitle>Create an invite</SectionTitle>
      <Text className="mb-1.5 text-xs text-muted-foreground">Expire after</Text>
      <Choices
        options={EXPIRY_OPTIONS}
        value={hours}
        onChange={setHours}
        disabled={creating}
      />
      <Text className="mb-1.5 text-xs text-muted-foreground">Max uses</Text>
      <Choices
        options={MAX_USES_OPTIONS}
        value={maxUses}
        onChange={setMaxUses}
        disabled={creating}
      />
      <SettingsButton
        label={creating ? "Creating…" : "Create and share an invite"}
        tone="primary"
        disabled={creating}
        onPress={() => void create()}
      />

      <SectionTitle>Active invites</SectionTitle>
      <ErrorText
        message={
          status?.error
            ? getErrorMessage(status.error, "Couldn't load invites.")
            : null
        }
      />
      {invites.length === 0 ? (
        <Muted>
          {status?.running
            ? "Loading…"
            : "No active invites yet. Create one above to let people join."}
        </Muted>
      ) : null}
      {invites.map((invite) => (
        <View
          key={invite.id}
          className="mb-2 flex-row items-center gap-2 rounded-xl bg-surface-panel px-3 py-2.5"
        >
          <View className="min-w-0 flex-1">
            <Text className="font-mono text-sm text-foreground">
              {invite.code}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {describe(invite)}
            </Text>
          </View>
          <SettingsButton label="Share" onPress={() => share(invite)} />
          <SettingsButton
            label="Revoke"
            tone="destructive"
            onPress={() => revoke(invite)}
          />
        </View>
      ))}
    </ScrollView>
  );
}
