import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Channel, ChannelOverwrite } from "@shared/lib/backend/records";
import type {
  OverwriteTarget,
  OverwriteValues,
} from "@shared/lib/backend/channels";
import { rolesOf } from "@shared/collections/roles/selectors";
import { membersOf } from "@shared/collections/members/selectors";
import {
  channelPermissionLabel,
  nextChannelPermission,
} from "@shared/features/permissions/channelPermissionControls";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useCore, useHavenCore } from "@mobile-data";
import {
  EditorSheet,
  ErrorText,
  Muted,
  SectionTitle,
  SettingsButton,
} from "./settingsUi";

type PermissionKey = keyof OverwriteValues;

const COLUMNS: Array<{ key: PermissionKey; label: string }> = [
  { key: "can_view", label: "View" },
  { key: "can_send", label: "Send" },
  { key: "can_manage", label: "Manage" },
];

const NONE: OverwriteValues = {
  can_view: null,
  can_send: null,
  can_manage: null,
};

type Row = {
  key: string;
  name: string;
  target: OverwriteTarget;
  values: OverwriteValues;
};

const valuesOf = (row: ChannelOverwrite | undefined): OverwriteValues =>
  row
    ? {
        can_view: row.can_view,
        can_send: row.can_send,
        can_manage: row.can_manage,
      }
    : NONE;

/**
 * A channel's exceptions to the community's roles: for a role, or for one
 * member, each of view, send and manage is left to the roles (Default),
 * allowed, or denied. Overwrites are read when the sheet opens
 * (`manage_channel_permissions`); who may see what changes for everyone
 * through `access.changed`.
 */
export function ChannelPermissionsSheet({
  communityId,
  channel,
  onClose,
}: {
  communityId: string;
  channel: Channel;
  onClose: () => void;
}) {
  const core = useHavenCore();
  const [overwrites, setOverwrites] = useState<ChannelOverwrite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addedMember, setAddedMember] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const reload = useCallback(async () => {
    try {
      setOverwrites(await core.backend.channels.listOverwrites(channel.id));
    } catch (cause) {
      setLoadError(getErrorMessage(cause, "Couldn't load permissions."));
    }
  }, [channel.id, core]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const roles = useCore(["roles"], (s) => rolesOf(s.roles, communityId));
  const members = useCore(["members", "profiles"], (s) =>
    membersOf(s.members, communityId)
      .map((m) => ({
        id: m.user_id,
        name: core.nameOf(m.user_id, communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const byRole = new Map(
    (overwrites ?? []).filter((o) => o.role_id).map((o) => [o.role_id!, o]),
  );
  const roleRows: Row[] = roles.map((role) => ({
    key: `role:${role.id}`,
    name: role.is_everyone ? "@everyone" : role.name,
    target: { role_id: role.id },
    values: valuesOf(byRole.get(role.id)),
  }));
  const memberRows: Row[] = (overwrites ?? [])
    .filter((o) => o.user_id)
    .map((o) => ({
      key: `member:${o.user_id}`,
      name: core.nameOf(o.user_id!, communityId),
      target: { user_id: o.user_id! },
      values: valuesOf(o),
    }));
  if (
    addedMember &&
    !memberRows.some((r) => r.key === `member:${addedMember}`)
  ) {
    memberRows.push({
      key: `member:${addedMember}`,
      name: core.nameOf(addedMember, communityId),
      target: { user_id: addedMember },
      values: NONE,
    });
  }

  const change = async (row: Row, key: PermissionKey) => {
    if (pending) return;
    setPending(row.key);
    setActionError(null);
    try {
      await core.backend.channels.setOverwrite(channel.id, row.target, {
        ...row.values,
        [key]: nextChannelPermission(row.values[key]),
      });
      await reload();
    } catch (cause) {
      setActionError(getErrorMessage(cause, "Couldn't change the permission."));
    } finally {
      setPending(null);
    }
  };

  return (
    <EditorSheet title={`#${channel.name ?? ""} permissions`} onClose={onClose}>
      <Text className="mb-3 text-xs text-muted-foreground">
        Each control cycles through default, allow, and deny. A member's
        exception wins over their roles'.
      </Text>
      <ErrorText message={actionError ?? loadError} />
      {overwrites === null && !loadError ? (
        <Muted>Loading channel permissions…</Muted>
      ) : (
        <ScrollView>
          <SectionTitle>Roles</SectionTitle>
          {roleRows.map((row) => (
            <PermissionRow
              key={row.key}
              row={row}
              pending={pending}
              onChange={(key) => void change(row, key)}
            />
          ))}
          <SectionTitle>Members</SectionTitle>
          {memberRows.length === 0 ? <Muted>None yet.</Muted> : null}
          {memberRows.map((row) => (
            <PermissionRow
              key={row.key}
              row={row}
              pending={pending}
              onChange={(key) => void change(row, key)}
            />
          ))}
          <View className="mt-2">
            <SettingsButton
              label={picking ? "Hide members" : "Add an exception for a member"}
              onPress={() => setPicking((p) => !p)}
            />
          </View>
          {picking
            ? members.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setAddedMember(member.id);
                    setPicking(false);
                  }}
                  className="border-b border-border-panel py-2.5"
                >
                  <Text className="text-sm text-foreground">{member.name}</Text>
                </Pressable>
              ))
            : null}
        </ScrollView>
      )}
      <View className="mt-3">
        <SettingsButton label="Done" tone="primary" onPress={onClose} />
      </View>
    </EditorSheet>
  );
}

function PermissionRow({
  row,
  pending,
  onChange,
}: {
  row: Row;
  pending: string | null;
  onChange: (key: PermissionKey) => void;
}) {
  return (
    <View className="mb-2 rounded-xl bg-surface-panel p-3">
      <Text className="mb-2 text-sm text-foreground" numberOfLines={1}>
        {row.name}
      </Text>
      <View className="flex-row gap-2">
        {COLUMNS.map((column) => {
          const value = row.values[column.key];
          return (
            <Pressable
              key={column.key}
              accessibilityRole="button"
              accessibilityLabel={`${column.label}: ${channelPermissionLabel(value)}`}
              disabled={pending !== null}
              onPress={() => onChange(column.key)}
              className={`flex-1 rounded-lg border px-2 py-1.5 ${
                value === true
                  ? "border-primary"
                  : value === false
                    ? "border-destructive"
                    : "border-border-control"
              } ${pending !== null ? "opacity-50" : ""}`}
            >
              <Text className="text-center text-[11px] text-muted-foreground">
                {column.label}
              </Text>
              <Text
                className={`text-center text-xs font-semibold ${
                  value === false ? "text-destructive" : "text-foreground"
                }`}
              >
                {pending === row.key ? "…" : channelPermissionLabel(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
