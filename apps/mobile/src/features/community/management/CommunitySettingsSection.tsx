import { ThemedIonicons } from "@/theme-rn";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import type {
  CommunityBanItem,
  ServerInvite,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
} from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import { useAuthStore } from "@mobile-data/session/authStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import {
  buildCommunityInviteUrl,
  shareCommunityInvite,
} from "@/features/invites/shareCommunityInvite";
import { RoleEditorPanel } from "./RoleEditorPanel";

type TabKey = "general" | "roles" | "members" | "invites" | "bans";

// Default color for a newly-created role (a data value, not a theme style).
const DEFAULT_ROLE_COLOR = "#99aab5";

// The "Owner" role is cosmetic — real ownership is the community_members.is_owner
// flag, which bypasses permission checks entirely. Hide it from role management so
// it can't be edited, deleted, or assigned (matches desktop ChannelSettingsModal,
// which filters the same role by name).
const isOwnerRole = (role: ServerRoleItem) =>
  role.name.trim().toLowerCase() === "owner";

type Props = {
  serverId: string;
  communityName: string;
  perms: ServerPermissions;
};

export function CommunitySettingsSection({ serverId, communityName, perms }: Props) {
  const core = useHavenCore();
  const admin = core.admin;
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
  const serverPanel = admin.useServerPanelState();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  const [tab, setTab] = useState<TabKey>("general");
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftPublicInvites, setDraftPublicInvites] = useState(false);
  const [draftReportReason, setDraftReportReason] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [customRolesOrder, setCustomRolesOrder] = useState<ServerRoleItem[]>([]);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [pendingRoleIds, setPendingRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [creatingSaving, setCreatingSaving] = useState(false);

  const {
    canManageServer,
    canManageRoles,
    canManageMembers,
    canManageBans,
    canManageInvites,
  } = perms;

  const loading =
    serverPanel.serverSettingsLoading ||
    serverPanel.serverRoleManagementLoading ||
    serverPanel.serverInvitesLoading ||
    serverPanel.communityBansLoading;

  const snapshots = useMemo(
    () => ({
      settings: serverPanel.serverSettingsInitialValues,
      roles: serverPanel.serverRoles,
      members: serverPanel.serverMembers,
      invites: serverPanel.serverInvites,
      bans: serverPanel.communityBans,
      permissionCatalog: serverPanel.serverPermissionCatalog,
    }),
    [serverPanel],
  );

  const isCurrentUserOwner = useMemo(
    () => snapshots.members.some((m) => m.userId === currentUserId && m.isOwner),
    [snapshots.members, currentUserId],
  );

  const loadErrors = useMemo(
    () => ({
      ...(serverPanel.serverSettingsLoadError ? { settings: serverPanel.serverSettingsLoadError } : {}),
      ...(serverPanel.serverRoleManagementError ? { roles: serverPanel.serverRoleManagementError } : {}),
      ...(serverPanel.serverInvitesError ? { invites: serverPanel.serverInvitesError } : {}),
      ...(serverPanel.communityBansError ? { bans: serverPanel.communityBansError } : {}),
    }),
    [
      serverPanel.communityBansError,
      serverPanel.serverInvitesError,
      serverPanel.serverRoleManagementError,
      serverPanel.serverSettingsLoadError,
    ],
  );

  const reloadSnapshots = useCallback(async () => {
    if (!serverId || !currentUserId) return;
    await Promise.allSettled([
      admin.loadServerSettings(serverId),
      admin.loadServerRoleManagement(serverId),
      canManageInvites
        ? admin.loadServerInvites(serverId)
        : Promise.resolve(admin.resetServerInvites()),
      canManageBans
        ? admin.loadCommunityBans(serverId)
        : Promise.resolve(admin.resetCommunityBans()),
    ]);
  }, [admin, canManageBans, canManageInvites, serverId, currentUserId]);

  useEffect(() => {
    void reloadSnapshots();
  }, [reloadSnapshots]);

  useEffect(() => {
    if (!snapshots.settings) return;
    setDraftName(snapshots.settings.name);
    setDraftDesc(snapshots.settings.description ?? "");
    setDraftPublicInvites(snapshots.settings.allowPublicInvites);
    setDraftReportReason(snapshots.settings.requireReportReason);
  }, [snapshots.settings]);

  useEffect(() => {
    const custom = snapshots.roles
      .filter((r) => !r.isSystem)
      .sort((a, b) => b.position - a.position);
    setCustomRolesOrder(custom);
  }, [snapshots.roles]);

  const systemRoles = useMemo(
    () =>
      snapshots.roles
        .filter((r) => r.isSystem && !isOwnerRole(r))
        .sort((a, b) => b.position - a.position),
    [snapshots.roles],
  );

  const refreshServers = useCallback(async () => {
    if (!currentUserId) return;
    await core.refreshCommunities(currentUserId);
  }, [core, currentUserId]);

  const handleSaveGeneral = async () => {
    if (!snapshots.settings) return;
    setSavingSettings(true);
    try {
      await admin.saveServerSettings(
        {
          name: draftName,
          description: draftDesc.trim() || null,
          allowPublicInvites: draftPublicInvites,
          requireReportReason: draftReportReason,
        },
        serverId,
      );
      await refreshServers();
      Alert.alert("Saved", "Community settings updated.");
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not save settings."));
    } finally {
      setSavingSettings(false);
    }
  };

  const onDragEnd = async ({ data }: { data: ServerRoleItem[] }) => {
    setCustomRolesOrder(data);
    if (!canManageRoles) return;
    try {
      const merged = [...systemRoles, ...data];
      await admin.reorderServerRoles(merged, serverId);
    } catch (e) {
      Alert.alert("Reorder failed", getErrorMessage(e, "Could not update role order."));
      void reloadSnapshots();
    }
  };

  const renderRoleRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ServerRoleItem>) => (
      <ScaleDecorator>
        <Pressable
          onPress={() => setSelectedRoleId(item.id)}
          onLongPress={drag}
          disabled={!canManageRoles}
          className={`mb-2 flex-row items-center justify-between rounded-xl border border-border-panel bg-surface-panel px-3 py-3 ${
            isActive ? "opacity-90" : ""
          }`}
        >
          <View className="flex-row items-center gap-2">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            <Text className="text-base text-foreground">{item.name}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <ThemedIonicons name="chevron-forward" size={16} colorClassName="accent-muted-foreground" />
            <ThemedIonicons name="reorder-three" size={22} colorClassName="accent-muted-foreground" />
          </View>
        </Pressable>
      </ScaleDecorator>
    ),
    [canManageRoles],
  );

  const rolesForAssignment = useMemo(
    () =>
      snapshots.roles
        .filter((r) => !isOwnerRole(r))
        .sort((a, b) => b.position - a.position),
    [snapshots.roles],
  );

  const selectedRole = useMemo(
    () => snapshots.roles.find((r) => r.id === selectedRoleId) ?? null,
    [snapshots.roles, selectedRoleId],
  );

  const mutedColor = resolveColorProp(themeTokens, "muted-foreground") ?? "#9aa0a6";

  const handleCreateRole = useCallback(async () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    setCreatingSaving(true);
    try {
      const maxPosition = snapshots.roles.reduce(
        (max, r) => Math.max(max, r.position),
        -1,
      );
      await admin.createServerRole({
        name: trimmed,
        color: DEFAULT_ROLE_COLOR,
        position: maxPosition + 1,
      });
      setNewRoleName("");
      setCreatingRole(false);
    } catch (e) {
      Alert.alert("Create failed", getErrorMessage(e, "Could not create role."));
    } finally {
      setCreatingSaving(false);
    }
  }, [admin, newRoleName, snapshots.roles]);

  const openMemberEditor = useCallback((member: ServerMemberRoleItem) => {
    setEditingMemberId(member.memberId);
    setPendingRoleIds(member.roleIds);
  }, []);

  const closeMemberEditor = useCallback(() => {
    setEditingMemberId(null);
    setPendingRoleIds([]);
  }, []);

  const togglePendingRole = useCallback((roleId: string) => {
    setPendingRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }, []);

  const handleSaveMemberRoles = useCallback(
    async (memberId: string) => {
      if (!canManageRoles) return;
      setSavingRoles(true);
      try {
        // saveServerMemberRoles fully reconciles the member's roles, so
        // pendingRoleIds (seeded from member.roleIds) must carry the complete
        // desired set — locked system/default roles included.
        await admin.saveServerMemberRoles(memberId, pendingRoleIds);
        closeMemberEditor();
      } catch (e) {
        Alert.alert("Save failed", getErrorMessage(e, "Could not update member roles."));
      } finally {
        setSavingRoles(false);
      }
    },
    [admin, canManageRoles, pendingRoleIds, closeMemberEditor],
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "Overview" },
    ...(canManageRoles ? [{ key: "roles" as const, label: "Roles" }] : []),
    ...(canManageMembers ? [{ key: "members" as const, label: "Members" }] : []),
    ...(canManageInvites ? [{ key: "invites" as const, label: "Invites" }] : []),
    ...(canManageBans ? [{ key: "bans" as const, label: "Bans" }] : []),
  ];

  return (
    <View className="flex-1">
      {/* Sub-tab strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-10 border-b border-border-panel pb-2"
        contentContainerStyle={{ gap: 8 }}
      >
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`rounded-full px-4 py-1 ${tab === t.key ? "bg-primary" : "bg-surface-panel"}`}
          >
            <Text
              className={`text-sm font-medium ${tab === t.key ? "text-primary-foreground" : "text-foreground"}`}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View className="flex-1 items-center justify-center py-8">
          <ActivityIndicator color={foregroundColor} />
        </View>
      ) : tab === "roles" && canManageRoles ? (
        selectedRole ? (
          <RoleEditorPanel
            key={selectedRole.id}
            role={selectedRole}
            permissionCatalog={snapshots.permissionCatalog}
            canManageRoles={canManageRoles}
            isCurrentUserOwner={isCurrentUserOwner}
            onBack={() => setSelectedRoleId(null)}
            onSaveDetails={({ name, color }) =>
              admin.updateServerRole({
                roleId: selectedRole.id,
                name,
                color,
                position: selectedRole.position,
              })
            }
            onSavePermissions={(keys) =>
              admin.saveServerRolePermissions(selectedRole.id, keys)
            }
            onDelete={() => admin.deleteServerRole(selectedRole.id)}
          />
        ) : (
          <View className="flex-1 pt-4">
            <View className="mb-3 flex-row items-start gap-2">
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Role hierarchy",
                    "Higher roles override lower ones. Tap a role to edit its permissions. Long-press and drag custom roles to reorder. System roles stay fixed.",
                  )
                }
                hitSlop={8}
              >
                <ThemedIonicons name="information-circle-outline" size={20} colorClassName="accent-muted-foreground" />
              </Pressable>
              <Text className="flex-1 text-sm text-muted-foreground">
                Tap a role to edit it. Long-press to reorder.
              </Text>
            </View>

            {creatingRole ? (
              <View className="mb-3 gap-2">
                <TextInput
                  value={newRoleName}
                  onChangeText={setNewRoleName}
                  placeholder="Role name"
                  placeholderTextColor={mutedColor}
                  autoFocus
                  className="rounded-xl border border-border-control bg-surface-panel px-3 py-3 text-foreground"
                />
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => void handleCreateRole()}
                    disabled={creatingSaving || !newRoleName.trim()}
                    className="flex-1 rounded-xl bg-primary py-3"
                  >
                    <Text className="text-center font-semibold text-primary-foreground">
                      {creatingSaving ? "Creating…" : "Create"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setCreatingRole(false);
                      setNewRoleName("");
                    }}
                    disabled={creatingSaving}
                    className="rounded-xl border border-border-panel px-4 py-3"
                  >
                    <Text className="text-foreground">Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setCreatingRole(true)}
                className="mb-3 flex-row items-center justify-center gap-1 rounded-xl border border-border-panel py-3"
              >
                <ThemedIonicons name="add" size={18} colorClassName="accent-muted-foreground" />
                <Text className="text-foreground">Add role</Text>
              </Pressable>
            )}

            {loadErrors.roles ? (
              <Text className="mb-2 text-sm text-destructive">{loadErrors.roles}</Text>
            ) : null}
            {systemRoles.length > 0 ? (
              <View className="mb-3">
                <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  System roles
                </Text>
                {systemRoles.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelectedRoleId(r.id)}
                    className="mb-2 flex-row items-center gap-2 rounded-xl border border-border-panel bg-surface-embedded px-3 py-3"
                  >
                    <View className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <Text className="flex-1 text-foreground">{r.name}</Text>
                    <ThemedIonicons name="chevron-forward" size={16} colorClassName="accent-muted-foreground" />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Custom roles
            </Text>
            <DraggableFlatList
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 32 }}
              data={customRolesOrder}
              keyExtractor={(item) => item.id}
              onDragEnd={onDragEnd}
              renderItem={renderRoleRow}
            />
          </View>
        )
      ) : (
        <ScrollView
          className="flex-1 pt-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === "general" ? (
            <View className="gap-4 pb-24">
              {loadErrors.settings ? (
                <Text className="text-sm text-destructive">{loadErrors.settings}</Text>
              ) : null}
              <Text className="text-xs uppercase text-muted-foreground">Community name</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                editable={canManageServer}
                className="rounded-xl border border-border-control bg-surface-panel px-3 py-3 text-foreground"
              />
              <Text className="text-xs uppercase text-muted-foreground">Description</Text>
              <TextInput
                value={draftDesc}
                onChangeText={setDraftDesc}
                multiline
                editable={canManageServer}
                className="min-h-22 rounded-xl border border-border-control bg-surface-panel px-3 py-3 text-foreground"
              />
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground">Allow public invites</Text>
                <Switch
                  value={draftPublicInvites}
                  onValueChange={setDraftPublicInvites}
                  disabled={!canManageServer}
                  trackColor={{ false: switchColors.false, true: switchColors.true }}
                  thumbColor={switchColors.thumb}
                />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground">Require report reason</Text>
                <Switch
                  value={draftReportReason}
                  onValueChange={setDraftReportReason}
                  disabled={!canManageServer}
                  trackColor={{ false: switchColors.false, true: switchColors.true }}
                  thumbColor={switchColors.thumb}
                />
              </View>
              {canManageServer ? (
                <Pressable
                  onPress={() => void handleSaveGeneral()}
                  disabled={savingSettings}
                  className="rounded-xl bg-primary py-3"
                >
                  <Text className="text-center font-semibold text-primary-foreground">
                    {savingSettings ? "Saving…" : "Save changes"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : tab === "members" && canManageMembers ? (
            <View className="pb-24">
              <Text className="mb-3 text-sm text-muted-foreground">
                {canManageRoles
                  ? "Tap a member to manage their roles."
                  : "Manage Roles is required to change role assignments."}
              </Text>
              {loadErrors.roles ? (
                <Text className="mb-2 text-sm text-destructive">{loadErrors.roles}</Text>
              ) : null}
              {snapshots.members.map((m) => {
                const isEditing = editingMemberId === m.memberId;
                const canEdit = canManageRoles && !m.isOwner;
                return (
                  <View
                    key={m.memberId}
                    className="mb-2 rounded-xl border border-border-panel bg-surface-panel px-3 py-3"
                  >
                    <Pressable
                      onPress={() => {
                        if (!canEdit) return;
                        if (isEditing) closeMemberEditor();
                        else openMemberEditor(m);
                      }}
                      disabled={!canEdit}
                      className="flex-row items-center justify-between"
                    >
                      <View className="flex-1">
                        <Text className="font-medium text-foreground">{m.displayName}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {m.isOwner ? "Owner · " : ""}
                          {m.roleIds.length} role{m.roleIds.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                      {canEdit ? (
                        <ThemedIonicons
                          name={isEditing ? "chevron-up" : "chevron-down"}
                          size={18}
                          colorClassName="accent-muted-foreground"
                        />
                      ) : null}
                    </Pressable>

                    {isEditing ? (
                      <View className="mt-3 border-t border-border-panel pt-3">
                        {rolesForAssignment.map((role) => {
                          const locked =
                            role.isDefault || (role.isSystem && !isCurrentUserOwner);
                          const checked = pendingRoleIds.includes(role.id) || role.isDefault;
                          return (
                            <View
                              key={role.id}
                              className="flex-row items-center justify-between py-2"
                            >
                              <View className="flex-1 flex-row items-center gap-2">
                                <View
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: role.color }}
                                />
                                <Text className="flex-1 text-foreground">{role.name}</Text>
                                {locked ? (
                                  <Text className="text-xs text-muted-foreground">
                                    {role.isDefault ? "Default" : "System"}
                                  </Text>
                                ) : null}
                              </View>
                              <Switch
                                value={checked}
                                onValueChange={() => togglePendingRole(role.id)}
                                disabled={locked || savingRoles}
                                trackColor={{ false: switchColors.false, true: switchColors.true }}
                                thumbColor={switchColors.thumb}
                              />
                            </View>
                          );
                        })}
                        <Pressable
                          onPress={() => void handleSaveMemberRoles(m.memberId)}
                          disabled={savingRoles}
                          className="mt-2 rounded-xl bg-primary py-3"
                        >
                          <Text className="text-center font-semibold text-primary-foreground">
                            {savingRoles ? "Saving…" : "Save roles"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : tab === "invites" && canManageInvites ? (
            <InvitesTab
              serverId={serverId}
              invites={snapshots.invites}
              loadError={loadErrors.invites}
              onCreateInvite={(input) => admin.createServerInvite(input, serverId)}
              onRevoke={(id) => admin.revokeServerInvite(id, serverId)}
            />
          ) : tab === "bans" && canManageBans ? (
            <BansTab
              bans={snapshots.bans}
              loadError={loadErrors.bans}
              onUnban={(bannedUserId) =>
                Alert.alert("Unban user", "Restore access for this user?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Unban",
                    onPress: () =>
                      void admin
                        .unbanUserFromCurrentServer({ targetUserId: bannedUserId }, serverId)
                        .catch((e) =>
                          Alert.alert("Error", getErrorMessage(e, "Unban failed.")),
                        ),
                  },
                ])
              }
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// -- Private sub-components --

function InvitesTab({
  serverId,
  invites,
  loadError,
  onCreateInvite,
  onRevoke,
}: {
  serverId: string;
  invites: ServerInvite[];
  loadError?: string;
  onCreateInvite: (input: { maxUses: number | null; expiresInHours: number | null }) => Promise<unknown>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const inv = (await onCreateInvite({ maxUses: null, expiresInHours: 24 })) as { code: string };
      await shareCommunityInvite(inv.code);
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not create invite."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View className="pb-24">
      {loadError ? <Text className="mb-2 text-sm text-destructive">{loadError}</Text> : null}
      <Pressable
        onPress={() => void handleCreate()}
        disabled={creating}
        className="mb-4 rounded-xl bg-primary py-3"
      >
        <Text className="text-center font-semibold text-primary-foreground">
          {creating ? "Creating…" : "Create invite (24h)"}
        </Text>
      </Pressable>
      {invites.map((inv) => (
        <View
          key={inv.id}
          className="mb-2 flex-row items-center justify-between rounded-xl border border-border-panel px-3 py-2"
        >
          <View className="min-w-0 flex-1 pr-3">
            <Text className="font-mono text-xs text-foreground">{inv.code}</Text>
            <Text className="mt-1 text-[11px] text-muted-foreground" numberOfLines={1}>
              {buildCommunityInviteUrl(inv.code)}
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => void shareCommunityInvite(inv.code)}>
              <Text className="text-sm text-primary">Share</Text>
            </Pressable>
            <Pressable onPress={() => void onRevoke(inv.id)}>
              <Text className="text-sm text-destructive">Revoke</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function BansTab({
  bans,
  loadError,
  onUnban,
}: {
  bans: CommunityBanItem[];
  loadError?: string;
  onUnban: (userId: string) => void;
}) {
  return (
    <View className="pb-24">
      {loadError ? <Text className="mb-2 text-sm text-destructive">{loadError}</Text> : null}
      {bans.length === 0 ? (
        <Text className="py-6 text-center text-sm text-muted-foreground">No bans.</Text>
      ) : null}
      {bans.map((b) => (
        <View
          key={b.id}
          className="mb-2 rounded-xl border border-border-panel bg-surface-panel px-3 py-3"
        >
          <Text className="font-medium text-foreground">{b.username ?? b.bannedUserId}</Text>
          <Text className="text-xs text-muted-foreground">{b.reason}</Text>
          <Pressable className="mt-2 self-start" onPress={() => onUnban(b.bannedUserId)}>
            <Text className="text-sm text-primary">Unban</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
