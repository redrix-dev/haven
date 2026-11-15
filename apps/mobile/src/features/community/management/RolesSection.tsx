import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import type { Permission, Role } from "@shared/lib/backend/records";
import { rolesOf, rolesOfMember } from "@shared/collections/roles/selectors";
import { membersOf } from "@shared/collections/members/selectors";
import { memberKey } from "@shared/collections/members/members";
import { permissionGroups } from "@shared/features/permissions/permissionCatalog";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useCore, useHavenCore, useStore } from "@mobile-data";
import { ThemedIonicons } from "@/theme-rn";
import {
  ErrorText,
  SectionTitle,
  SettingsButton,
  SettingsField,
} from "./settingsUi";

const ROLE_COLORS = [
  "#99aab5",
  "#f04747",
  "#faa61a",
  "#43b581",
  "#3f79d8",
  "#9b59b6",
  "#e91e63",
  "#1abc9c",
];

/**
 * A community's roles, highest first, for those with `manage_roles`: what
 * each allows and who holds it. The database refuses anything at or above
 * the person's own rank, and says so; what a role allows comes back with the
 * reload `access.changed` asks for.
 */
export function RolesSection({ communityId }: { communityId: string }) {
  const core = useHavenCore();
  const roles = useStore("roles", (s) => rolesOf(s, communityId));
  const held = useStore("roles", (s) => s.held);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = roles.find((role) => role.id === selectedId) ?? null;

  const holders = (roleId: string) =>
    Object.entries(held).filter(
      ([key, ids]) => key.startsWith(`${communityId}:`) && ids.includes(roleId),
    ).length;

  const createRole = async () => {
    setError(null);
    try {
      const role = await core.roles.create(communityId, "New role", {
        color: ROLE_COLORS[0],
      });
      setSelectedId(role.id);
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't create the role."));
    }
  };

  if (selected) {
    return (
      <RoleEditor
        key={selected.id}
        role={selected}
        communityId={communityId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <ScrollView>
      <ErrorText message={error} />
      <SettingsButton
        label="New role"
        tone="primary"
        onPress={() => void createRole()}
      />
      <View className="mt-3">
        {roles.map((role) => (
          <Pressable
            key={role.id}
            accessibilityRole="button"
            onPress={() => setSelectedId(role.id)}
            className="mb-1 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-surface-hover"
          >
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: role.color }}
            />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {role.is_everyone ? "@everyone" : role.name}
            </Text>
            {!role.is_everyone ? (
              <Text className="text-xs text-muted-foreground">
                {holders(role.id)}
              </Text>
            ) : null}
            <ThemedIonicons
              name="chevron-forward"
              size={14}
              colorClassName="accent-muted-foreground"
            />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function RoleEditor({
  role,
  communityId,
  onBack,
}: {
  role: Role;
  communityId: string;
  onBack: () => void;
}) {
  const core = useHavenCore();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [keys, setKeys] = useState<Permission[]>(() => [
    ...(core.stores.roles.getState().permissions[role.id] ?? []),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = permissionGroups();
  const members = useCore(["members", "profiles"], (s) =>
    membersOf(s.members, communityId)
      .map((m) => ({
        id: m.user_id,
        name: core.nameOf(m.user_id, communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const held = useStore("roles", (s) => s.held);

  const toggle = (key: Permission) =>
    setKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!role.is_everyone) {
        await core.roles.update(role.id, {
          name: name.trim() || role.name,
          color,
        });
      }
      await core.roles.setPermissions(role.id, keys);
      Alert.alert("Role saved");
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save the role."));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(
      `Delete ${role.name}?`,
      "Everyone who holds it loses what it allows.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void core.roles
              .remove(role.id)
              .then(onBack)
              .catch((cause: unknown) =>
                setError(getErrorMessage(cause, "Couldn't delete the role.")),
              ),
        },
      ],
    );

  const setHolds = async (userId: string, on: boolean) => {
    setError(null);
    const current = rolesOfMember(
      core.stores.roles.getState(),
      communityId,
      userId,
    ).map((r) => r.id);
    const next = on
      ? [...new Set([...current, role.id])]
      : current.filter((id) => id !== role.id);
    try {
      await core.roles.setMemberRoles(communityId, userId, next);
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't change their roles."));
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="mb-3 flex-row items-center gap-2"
      >
        <ThemedIonicons
          name="chevron-back"
          size={18}
          colorClassName="accent-foreground"
        />
        <View
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Text className="text-base font-semibold text-foreground">
          {role.is_everyone ? "@everyone" : role.name}
        </Text>
      </Pressable>
      <ErrorText message={error} />

      {role.is_everyone ? (
        <Text className="mb-3 text-sm text-muted-foreground">
          Everyone in the community holds this role. What it allows, every
          member may do.
        </Text>
      ) : (
        <>
          <SettingsField
            label="Role name"
            value={name}
            onChangeText={setName}
          />
          <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Color
          </Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {ROLE_COLORS.map((swatch) => (
              <Pressable
                key={swatch}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === swatch }}
                onPress={() => setColor(swatch)}
                className={`h-9 w-9 items-center justify-center rounded-full border-2 ${
                  color === swatch ? "border-foreground" : "border-transparent"
                }`}
              >
                <View
                  className="h-7 w-7 rounded-full"
                  style={{ backgroundColor: swatch }}
                />
              </Pressable>
            ))}
          </View>
        </>
      )}

      <SectionTitle>Permissions</SectionTitle>
      {groups.map((group) => (
        <View key={group.label} className="mb-3">
          <Text className="mb-1.5 text-xs font-semibold text-muted-foreground">
            {group.label}
          </Text>
          {group.permissions.map((perm) => (
            <View
              key={perm.key}
              className="mb-1.5 flex-row items-center gap-3 rounded-xl bg-surface-panel px-3 py-2.5"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-foreground">{perm.label}</Text>
                <Text className="text-xs text-muted-foreground">
                  {perm.description}
                </Text>
              </View>
              <Switch
                accessibilityLabel={perm.label}
                value={keys.includes(perm.key)}
                disabled={saving}
                onValueChange={() => toggle(perm.key)}
              />
            </View>
          ))}
        </View>
      ))}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <SettingsButton
            label={saving ? "Saving…" : "Save role"}
            tone="primary"
            disabled={saving}
            onPress={() => void save()}
          />
        </View>
        {!role.is_everyone ? (
          <SettingsButton label="Delete" tone="destructive" onPress={remove} />
        ) : null}
      </View>

      {!role.is_everyone ? (
        <>
          <SectionTitle>Members with this role</SectionTitle>
          {members.map((member) => (
            <View
              key={member.id}
              className="flex-row items-center justify-between border-b border-border-panel py-2"
            >
              <Text className="text-sm text-foreground">{member.name}</Text>
              <Switch
                accessibilityLabel={`${member.name} holds ${role.name}`}
                value={(held[memberKey(communityId, member.id)] ?? []).includes(
                  role.id,
                )}
                onValueChange={(on) => void setHolds(member.id, on)}
              />
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
