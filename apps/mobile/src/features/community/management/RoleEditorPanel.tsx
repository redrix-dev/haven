import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  PermissionCatalogItem,
  ServerRoleItem,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import { ThemedIonicons } from "@/theme-rn";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { buildVisiblePermissionGroups } from "./communityPermissionMeta";

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

type RoleEditorPanelProps = {
  role: ServerRoleItem;
  permissionCatalog: PermissionCatalogItem[];
  canManageRoles: boolean;
  isCurrentUserOwner: boolean;
  onBack: () => void;
  onSaveDetails: (input: { name: string; color: string }) => Promise<void>;
  onSavePermissions: (permissionKeys: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function RoleEditorPanel({
  role,
  permissionCatalog,
  canManageRoles,
  isCurrentUserOwner,
  onBack,
  onSaveDetails,
  onSavePermissions,
  onDelete,
}: RoleEditorPanelProps) {
  const themeTokens = useMobileThemeTokens();
  const foregroundColor =
    resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const switchColors = useMemo(
    () => ({
      false: resolveColorProp(themeTokens, "border-panel") ?? "#3d4f6a",
      true: resolveColorProp(themeTokens, "primary") ?? "#4f8df5",
      thumb: foregroundColor,
    }),
    [foregroundColor, themeTokens],
  );

  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [pendingPermissionKeys, setPendingPermissionKeys] = useState<string[]>(
    role.permissionKeys,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEditDetails =
    canManageRoles && (!role.isSystem || isCurrentUserOwner) && !role.isDefault;
  const canEditPermissions =
    canManageRoles && (!role.isSystem || isCurrentUserOwner);
  const canDelete =
    canManageRoles && !role.isDefault && (!role.isSystem || isCurrentUserOwner);

  const permissionGroups = useMemo(
    () => buildVisiblePermissionGroups(permissionCatalog),
    [permissionCatalog],
  );

  const togglePermission = (key: string) => {
    setPendingPermissionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const busy = saving || deleting;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (canEditDetails) await onSaveDetails({ name: name.trim(), color });
      if (canEditPermissions) await onSavePermissions(pendingPermissionKeys);
      onBack();
    } catch (e) {
      Alert.alert("Save failed", getErrorMessage(e, "Could not save role."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete role",
      `Delete "${role.name}"? This removes it from every member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete();
              onBack();
            } catch (e) {
              Alert.alert(
                "Delete failed",
                getErrorMessage(e, "Could not delete role."),
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 pt-4">
      <Pressable
        onPress={onBack}
        hitSlop={8}
        className="mb-3 flex-row items-center gap-1"
      >
        <ThemedIonicons
          name="chevron-back"
          size={20}
          colorClassName="accent-muted-foreground"
        />
        <Text className="text-sm text-muted-foreground">Roles</Text>
      </Pressable>

      <View className="mb-4 flex-row items-center gap-2">
        <View
          className="h-3.5 w-3.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Text className="flex-1 text-lg font-semibold text-foreground">
          {role.name}
        </Text>
        {role.isDefault ? (
          <Text className="text-xs text-muted-foreground">Default</Text>
        ) : role.isSystem ? (
          <Text className="text-xs text-muted-foreground">System</Text>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {canEditDetails ? (
          <View className="mb-5 gap-3">
            <Text className="text-xs uppercase text-muted-foreground">
              Role name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!busy}
              className="rounded-xl border border-border-control bg-surface-panel px-3 py-3 text-foreground"
            />
            <Text className="text-xs uppercase text-muted-foreground">
              Color
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {ROLE_COLORS.map((swatch) => (
                <Pressable
                  key={swatch}
                  onPress={() => setColor(swatch)}
                  disabled={busy}
                  className={`h-9 w-9 items-center justify-center rounded-full border ${
                    color === swatch
                      ? "border-foreground"
                      : "border-border-panel"
                  }`}
                >
                  <View
                    className="h-6 w-6 rounded-full"
                    style={{ backgroundColor: swatch }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Text className="mb-4 text-sm text-muted-foreground">
            {role.isSystem
              ? "System role details are fixed."
              : role.isDefault
                ? "The default role's name and color are fixed."
                : "You don't have permission to edit this role."}
          </Text>
        )}

        <Text className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Permissions
        </Text>
        {!canEditPermissions ? (
          <Text className="mb-3 text-xs text-muted-foreground">
            Read-only — you can't change this role's permissions.
          </Text>
        ) : null}

        {permissionGroups.map((group) => (
          <View key={group.scope} className="mb-4">
            <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {group.label}
            </Text>
            {group.permissions.map((permission) => (
              <View
                key={permission.key}
                className="mb-2 flex-row items-center justify-between rounded-xl border border-border-panel bg-surface-panel px-3 py-3"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-foreground">{permission.label}</Text>
                  {permission.description ? (
                    <Text className="text-xs text-muted-foreground">
                      {permission.description}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={pendingPermissionKeys.includes(permission.key)}
                  onValueChange={() => togglePermission(permission.key)}
                  disabled={!canEditPermissions || busy}
                  trackColor={{
                    false: switchColors.false,
                    true: switchColors.true,
                  }}
                  thumbColor={switchColors.thumb}
                />
              </View>
            ))}
          </View>
        ))}

        {canEditDetails || canEditPermissions ? (
          <Pressable
            onPress={() => void handleSave()}
            disabled={busy}
            className="mt-1 rounded-xl bg-primary py-3"
          >
            <Text className="text-center font-semibold text-primary-foreground">
              {saving ? "Saving…" : "Save role"}
            </Text>
          </Pressable>
        ) : null}

        {canDelete ? (
          <Pressable
            onPress={handleDelete}
            disabled={busy}
            className="mb-24 mt-3 rounded-xl border border-destructive py-3"
          >
            <Text className="text-center font-semibold text-destructive">
              {deleting ? "Deleting…" : "Delete role"}
            </Text>
          </Pressable>
        ) : (
          <View className="mb-24" />
        )}
      </ScrollView>
    </View>
  );
}
