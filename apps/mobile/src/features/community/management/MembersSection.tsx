import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { bansOf, membersOf } from "@shared/collections/members/selectors";
import { outranks } from "@shared/collections/roles/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import {
  useCore,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { usePeople } from "@/features/people/PeopleProvider";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import {
  EditorSheet,
  ErrorText,
  Muted,
  SectionTitle,
  SettingsButton,
} from "./settingsUi";

/**
 * The community's members, and its bans, for those who may remove people.
 * Removing is offered only over someone ranked below the person; the
 * database decides again.
 */
export function MembersSection({ communityId }: { communityId: string }) {
  const core = useHavenCore();
  const people = usePeople();
  const me = useMe() ?? "";
  const members = useCore(["members", "profiles"], (s) =>
    membersOf(s.members, communityId)
      .map((m) => ({
        id: m.user_id,
        name: core.nameOf(m.user_id, communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const bans = useStore("members", (s) => bansOf(s, communityId));
  const canKick = useStore("communities", () =>
    core.communities.can(communityId, "manage_members"),
  );
  const canBan = useStore("communities", () =>
    core.communities.can(communityId, "manage_bans"),
  );
  const above = useCore(["roles", "communities"], (s) => {
    const community = s.communities.byId[communityId];
    if (!community) return {} as Record<string, boolean>;
    return Object.fromEntries(
      members.map((m) => [m.id, outranks(s.roles, community, me, m.id)]),
    );
  });
  const [banning, setBanning] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canBan) void core.members.loadBans(communityId).catch(() => {});
  }, [canBan, communityId, core]);

  const kick = (member: { id: string; name: string }) =>
    Alert.alert(
      `Remove ${member.name}?`,
      "They can come back with a new invite.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void core.members
              .kick(communityId, member.id)
              .catch((cause: unknown) =>
                setError(getErrorMessage(cause, "Couldn't remove them.")),
              ),
        },
      ],
    );

  return (
    <ScrollView>
      <ErrorText message={error} />
      <SectionTitle>Members ({members.length})</SectionTitle>
      {members.map((member) => (
        <View
          key={member.id}
          className="flex-row items-center gap-2 border-b border-border-panel py-2"
        >
          <Pressable
            accessibilityRole="button"
            className="min-w-0 flex-1"
            onPress={() => people.openProfile(member.id, communityId)}
          >
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {member.name}
            </Text>
          </Pressable>
          {canKick && above[member.id] ? (
            <SettingsButton label="Remove" onPress={() => kick(member)} />
          ) : null}
          {canBan && above[member.id] ? (
            <SettingsButton
              label="Ban"
              tone="destructive"
              onPress={() => setBanning(member)}
            />
          ) : null}
        </View>
      ))}

      {canBan ? (
        <>
          <SectionTitle>Banned</SectionTitle>
          {bans.length === 0 ? <Muted>Nobody is banned.</Muted> : null}
          {bans.map((ban) => (
            <BanRow
              key={ban.user_id}
              communityId={communityId}
              userId={ban.user_id}
              reason={ban.reason}
              onError={setError}
            />
          ))}
        </>
      ) : null}

      {banning ? (
        <BanSheet
          communityId={communityId}
          member={banning}
          onClose={() => setBanning(null)}
        />
      ) : null}
    </ScrollView>
  );
}

function BanRow({
  communityId,
  userId,
  reason,
  onError,
}: {
  communityId: string;
  userId: string;
  reason: string;
  onError: (message: string) => void;
}) {
  const core = useHavenCore();
  const name = useNameOf(userId);
  return (
    <View className="flex-row items-center gap-2 border-b border-border-panel py-2">
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-foreground">{name}</Text>
        {reason ? (
          <Text className="text-xs text-muted-foreground">{reason}</Text>
        ) : null}
      </View>
      <SettingsButton
        label="Unban"
        onPress={() =>
          void core.members
            .unban(communityId, userId)
            .catch((cause: unknown) =>
              onError(getErrorMessage(cause, "Couldn't unban them.")),
            )
        }
      />
    </View>
  );
}

function BanSheet({
  communityId,
  member,
  onClose,
}: {
  communityId: string;
  member: { id: string; name: string };
  onClose: () => void;
}) {
  const core = useHavenCore();
  const tokens = useMobileThemeTokens();
  const placeholder = resolveColorProp(tokens, "muted-foreground") ?? "#8b9cbb";
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ban = async () => {
    if (!reason.trim()) {
      setError("A ban needs a reason. Only moderators see it.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await core.members.ban(communityId, member.id, reason.trim());
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't ban them."));
    } finally {
      setWorking(false);
    }
  };

  return (
    <EditorSheet title={`Ban ${member.name}?`} onClose={onClose}>
      <Text className="mb-3 text-sm text-muted-foreground">
        They're removed and can't come back, even with an invite, until
        unbanned. Their messages are hidden from everyone but moderators.
      </Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Reason (only moderators see it)"
        placeholderTextColor={placeholder}
        multiline
        className="mb-3 min-h-22 rounded-xl border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
      />
      <ErrorText message={error} />
      <View className="flex-row justify-end gap-2">
        <SettingsButton label="Cancel" disabled={working} onPress={onClose} />
        <SettingsButton
          label={working ? "Banning…" : "Ban"}
          tone="destructive"
          disabled={working}
          onPress={() => void ban()}
        />
      </View>
    </EditorSheet>
  );
}
