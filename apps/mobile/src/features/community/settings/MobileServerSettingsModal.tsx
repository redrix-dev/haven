import { ThemedIonicons } from "@/theme-rn";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import type { ServerRoleItem, ServerSettingsUpdate } from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import { getPlatformInviteBaseUrl } from "@shared/platform/urls";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

type MobileServerSnapshots = {
  settings: ServerSettingsUpdate | null;
  roles: ServerRoleItem[];
  members: import("@shared/lib/backend/types").ServerMemberRoleItem[];
  invites: import("@shared/lib/backend/types").ServerInvite[];
  bans: import("@shared/lib/backend/types").CommunityBanItem[];
  permissionsCatalog: import("@shared/lib/backend/types").PermissionCatalogItem[];
};

type TabKey = "general" | "roles" | "members" | "invites" | "bans";

type MobileServerSettingsModalProps = {
  visible: boolean;
  onDismiss: () => void;
  communityId: string | null;
  communityName: string;
  currentUserId: string | null;
  canManageServer: boolean;
  canManageRoles: boolean;
  canManageMembers: boolean;
  canManageBans: boolean;
  canManageInvites: boolean;
  refreshServers: () => Promise<void>;
};

export function MobileServerSettingsModal({
  visible,
  onDismiss,
  communityId,
  communityName,
  currentUserId,
  canManageServer,
  canManageRoles,
  canManageMembers,
  canManageBans,
  canManageInvites,
  refreshServers,
}: MobileServerSettingsModalProps) {
  const core = useHavenCore();
  const admin = core.admin;
  const serverPanel = admin.useServerPanelState();
  const [tab, setTab] = useState<TabKey>("general");

  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftPublicInvites, setDraftPublicInvites] = useState(false);
  const [draftReportReason, setDraftReportReason] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [customRolesOrder, setCustomRolesOrder] = useState<ServerRoleItem[]>([]);

  const loading =
    serverPanel.serverSettingsLoading ||
    serverPanel.serverRoleManagementLoading ||
    serverPanel.serverInvitesLoading ||
    serverPanel.communityBansLoading;

  const snapshots = useMemo<MobileServerSnapshots>(
    () => ({
      settings: serverPanel.serverSettingsInitialValues,
      roles: serverPanel.serverRoles,
      members: serverPanel.serverMembers,
      invites: serverPanel.serverInvites,
      bans: serverPanel.communityBans,
      permissionsCatalog: serverPanel.serverPermissionCatalog,
    }),
    [serverPanel],
  );

  const loadErrors = useMemo(
    () => ({
      ...(serverPanel.serverSettingsLoadError
        ? { settings: serverPanel.serverSettingsLoadError }
        : {}),
      ...(serverPanel.serverRoleManagementError
        ? { roles: serverPanel.serverRoleManagementError }
        : {}),
      ...(serverPanel.serverInvitesError
        ? { invites: serverPanel.serverInvitesError }
        : {}),
      ...(serverPanel.communityBansError
        ? { bans: serverPanel.communityBansError }
        : {}),
    }),
    [
      serverPanel.communityBansError,
      serverPanel.serverInvitesError,
      serverPanel.serverRoleManagementError,
      serverPanel.serverSettingsLoadError,
    ],
  );

  const reloadSnapshots = useCallback(async () => {
    if (!communityId || !currentUserId) return;
    await Promise.allSettled([
      admin.loadServerSettings(communityId),
      admin.loadServerRoleManagement(communityId),
      canManageInvites ? admin.loadServerInvites(communityId) : Promise.resolve(admin.resetServerInvites()),
      canManageBans ? admin.loadCommunityBans(communityId) : Promise.resolve(admin.resetCommunityBans()),
    ]);
  }, [admin, canManageBans, canManageInvites, communityId, currentUserId]);

  useEffect(() => {
    if (!visible || !communityId) return;
    void reloadSnapshots();
  }, [visible, communityId, reloadSnapshots]);

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

  const systemRoles = useMemo(() => {
    if (!snapshots) return [];
    return snapshots.roles.filter((r) => r.isSystem).sort((a, b) => b.position - a.position);
  }, [snapshots]);

  const handleSaveGeneral = async () => {
    if (!snapshots.settings) return;
    setSavingSettings(true);
    try {
      await admin.saveServerSettings({
        name: draftName,
        description: draftDesc.trim() || null,
        allowPublicInvites: draftPublicInvites,
        requireReportReason: draftReportReason,
      }, communityId);
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
    if (!snapshots || !canManageRoles) return;
    try {
      const merged = [...systemRoles, ...data];
      await admin.reorderServerRoles(merged, communityId);
    } catch (e) {
      Alert.alert("Reorder failed", getErrorMessage(e, "Could not update role order."));
      void reloadSnapshots();
    }
  };

  const renderRoleRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ServerRoleItem>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={!canManageRoles}
          className={`mb-2 flex-row items-center justify-between rounded-xl border border-border bg-surface-panel px-3 py-3 ${
            isActive ? "opacity-90" : ""
          }`}
        >
          <View className="flex-row items-center gap-2">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            <Text className="text-base text-foreground">{item.name}</Text>
          </View>
          <ThemedIonicons name="reorder-three" size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
      </ScaleDecorator>
    ),
    [canManageRoles],
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "Overview" },
    ...(canManageRoles ? [{ key: "roles" as const, label: "Roles" }] : []),
    ...(canManageMembers ? [{ key: "members" as const, label: "Members" }] : []),
    ...(canManageInvites ? [{ key: "invites" as const, label: "Invites" }] : []),
    ...(canManageBans ? [{ key: "bans" as const, label: "Bans" }] : []),
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View className="flex-1 bg-card pt-14">
        <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
          <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
            {communityName}
          </Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text className="text-lg text-muted-foreground">Done</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="max-h-12 border-b border-border py-2"
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className={`rounded-full px-4 py-1.5 ${tab === t.key ? "bg-primary" : "bg-surface-panel"}`}
            >
              <Text className={`text-sm font-medium ${tab === t.key ? "text-primary-foreground" : "text-foreground"}`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View className="flex-1 items-center justify-center py-12">
            {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground */}
            <ActivityIndicator color="#e6edf7" />
          </View>
        ) : tab === "roles" && canManageRoles ? (
          <View className="flex-1 px-4 pt-4">
            <View className="mb-3 flex-row items-start gap-2">
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Role hierarchy",
                    "Higher roles override lower ones when multiple roles grant the same permission. Long-press and drag custom roles to change hierarchy. System roles stay fixed above the draggable list.",
                  )
                }
                hitSlop={8}
              >
                <ThemedIonicons name="information-circle-outline" size={22} colorClassName="accent-muted-foreground" />
              </Pressable>
              <Text className="flex-1 text-sm text-muted-foreground">
                Long-press a row to drag. System roles are fixed above custom roles.
              </Text>
            </View>
            {loadErrors.roles ? <Text className="mb-2 text-sm text-destructive">{loadErrors.roles}</Text> : null}
            {systemRoles.length > 0 ? (
              <View className="mb-3">
                <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">System roles</Text>
                {systemRoles.map((r) => (
                  <View
                    key={r.id}
                    className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface-embedded px-3 py-3"
                  >
                    <View className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <Text className="flex-1 text-foreground">{r.name}</Text>
                    <ThemedIonicons name="lock-closed" size={16} colorClassName="accent-muted-foreground" />
                  </View>
                ))}
              </View>
            ) : null}
            <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Custom roles</Text>
            <DraggableFlatList
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 32 }}
              data={customRolesOrder}
              keyExtractor={(item) => item.id}
              onDragEnd={onDragEnd}
              renderItem={renderRoleRow}
            />
          </View>
        ) : (
          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
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
                  className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
                />
                <Text className="text-xs uppercase text-muted-foreground">Description</Text>
                <TextInput
                  value={draftDesc}
                  onChangeText={setDraftDesc}
                  multiline
                  editable={canManageServer}
                  className="min-h-22 rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
                />
                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground">Allow public invites</Text>
                  <Switch
                    value={draftPublicInvites}
                    onValueChange={setDraftPublicInvites}
                    disabled={!canManageServer}
                  />
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground">Require report reason</Text>
                  <Switch
                    value={draftReportReason}
                    onValueChange={setDraftReportReason}
                    disabled={!canManageServer}
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
            ) : null}

            {tab === "members" && canManageMembers ? (
              <View className="pb-24">
                <Text className="mb-3 text-sm text-muted-foreground">
                  Members and role assignment match desktop. Granular role edits are safest on desktop; this list is for
                  visibility.
                </Text>
                {(snapshots?.members ?? []).map((m) => (
                  <View key={m.memberId} className="mb-2 rounded-xl border border-border bg-surface-panel px-3 py-3">
                    <Text className="font-medium text-foreground">{m.displayName}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {m.isOwner ? "Owner · " : ""}
                      {m.roleIds.length} role{m.roleIds.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {tab === "invites" && canManageInvites ? (
              <MobileInvitesSection
                communityId={communityId}
                invites={snapshots?.invites ?? []}
                loadError={loadErrors.invites}
                onCreateInvite={(input) => admin.createServerInvite(input, communityId)}
                onRevoke={(id) => admin.revokeServerInvite(id, communityId)}
              />
            ) : null}

            {tab === "bans" && canManageBans ? (
              <MobileBansSection
                bans={snapshots?.bans ?? []}
                loadError={loadErrors.bans}
                onUnban={(bannedUserId) =>
                  Alert.alert("Unban user", "Restore access for this user?", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Unban",
                      onPress: () =>
                        void admin.unbanUserFromCurrentServer({ targetUserId: bannedUserId }, communityId).catch((e) =>
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
    </Modal>
  );
}

function MobileInvitesSection({
  communityId,
  invites,
  loadError,
  onCreateInvite,
  onRevoke,
}: {
  communityId: string | null;
  invites: MobileServerSnapshots["invites"];
  loadError?: string;
  onCreateInvite: (input: {
    maxUses: number | null;
    expiresInHours: number | null;
  }) => Promise<unknown>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const baseUrl = useMemo(() => getPlatformInviteBaseUrl(), []);

  const handleCreate = async () => {
    if (!communityId) return;
    setCreating(true);
    try {
      const inv = (await onCreateInvite({ maxUses: null, expiresInHours: 24 })) as {
        code: string;
      };
      Alert.alert("Invite created", `${baseUrl}${inv.code}`, [{ text: "OK" }]);
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
        <Text className="text-center font-semibold text-primary-foreground">{creating ? "Creating…" : "Create invite (24h)"}</Text>
      </Pressable>
      {invites.map((inv) => (
        <View key={inv.id} className="mb-2 flex-row items-center justify-between rounded-xl border border-border px-3 py-2">
          <Text className="font-mono text-xs text-foreground">{inv.code}</Text>
          <Pressable onPress={() => void onRevoke(inv.id)}>
            <Text className="text-sm text-destructive">Revoke</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function MobileBansSection({
  bans,
  loadError,
  onUnban,
}: {
  bans: MobileServerSnapshots["bans"];
  loadError?: string;
  onUnban: (userId: string) => void;
}) {
  return (
    <View className="pb-24">
      {loadError ? <Text className="mb-2 text-sm text-destructive">{loadError}</Text> : null}
      {bans.map((b) => (
        <View key={b.id} className="mb-2 rounded-xl border border-border bg-surface-panel px-3 py-3">
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
