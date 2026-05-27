import { ThemedIonicons } from "@/theme-rn";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Channel, ChannelPermissionState, ServerPermissions } from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

type Props = {
  serverId: string;
  channels: Channel[];
  perms: ServerPermissions;
};

export function ChannelSettingsSection({ serverId, channels, perms }: Props) {
  const [managedChannelId, setManagedChannelId] = useState<string | null>(null);
  const managedChannel = channels.find((c) => c.id === managedChannelId) ?? null;

  if (managedChannel) {
    return (
      <ChannelDetail
        channel={managedChannel}
        serverId={serverId}
        perms={perms}
        onBack={() => setManagedChannelId(null)}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {channels.length === 0 ? (
        <Text className="py-6 text-center text-sm text-muted-foreground">No channels yet.</Text>
      ) : (
        channels.map((channel) => {
          const isVoice = channel.kind === "voice";
          return (
            <Pressable
              key={channel.id}
              className="mb-1 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-surface-hover"
              onPress={() => setManagedChannelId(channel.id)}
            >
              <ThemedIonicons
                name={isVoice ? "volume-medium-outline" : "chatbox-outline"}
                size={16}
                colorClassName="accent-muted-foreground"
              />
              <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                {channel.name}
              </Text>
              <ThemedIonicons name="chevron-forward" size={15} colorClassName="accent-muted-foreground" />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

// -- Channel detail --

function ChannelDetail({
  channel,
  serverId,
  perms,
  onBack,
}: {
  channel: Channel;
  serverId: string;
  perms: ServerPermissions;
  onBack: () => void;
}) {
  const core = useHavenCore();
  const admin = core.admin;
  const channelPermissions = admin.useChannelPermissionsState();
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [roleRows, setRoleRows] = useState<
    Array<{
      roleId: string;
      name: string;
      color: string;
      canView: boolean | null;
      canSend: boolean | null;
    }>
  >([]);
  const [saving, setSaving] = useState(false);

  const { canManageChannelStructure, canManageChannelPermissions } = perms;

  const load = useCallback(async () => {
    try {
      setName(channel.name);
      setTopic(channel.topic ?? "");
      await admin.loadChannelPermissions(channel.id, serverId);
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Failed to load channel settings."));
    }
  }, [admin, channel, serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setRoleRows(
      channelPermissions.channelRolePermissions.map((r) => ({
        roleId: r.roleId,
        name: r.name,
        color: r.color,
        canView: r.canView,
        canSend: r.canSend,
      })),
    );
  }, [channelPermissions.channelRolePermissions]);

  const cycle = (v: boolean | null): boolean | null => {
    if (v === null) return true;
    if (v === true) return false;
    return null;
  };

  const saveGeneral = async () => {
    setSaving(true);
    try {
      await admin.saveChannelSettings(
        { name: name.trim(), topic: topic.trim() || null },
        serverId,
        channel.id,
      );
      Alert.alert("Saved", "Channel updated.");
      onBack();
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not save channel."));
    } finally {
      setSaving(false);
    }
  };

  const saveRoleRow = async (roleId: string, next: ChannelPermissionState) => {
    try {
      await admin.saveRoleChannelPermissions(roleId, next, serverId, channel.id);
      await load();
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not update permissions."));
    }
  };

  return (
    <View className="flex-1">
      {/* Back row */}
      <Pressable
        className="mb-3 flex-row items-center gap-1 self-start rounded-xl px-1 py-1.5 active:bg-surface-hover"
        onPress={onBack}
        hitSlop={8}
      >
        <ThemedIonicons name="chevron-back" size={18} colorClassName="accent-muted-foreground" />
        <Text className="text-sm font-medium text-muted-foreground">#{channel.name}</Text>
      </Pressable>

      {channelPermissions.channelPermissionsLoading ? (
        <View className="flex-1 items-center justify-center">
          {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color value; resolves to --foreground */}
          <ActivityIndicator color="#e6edf7" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          <Text className="mb-1 text-xs uppercase text-muted-foreground">Channel name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            editable={canManageChannelStructure}
            className="mb-4 rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
          />
          <Text className="mb-1 text-xs uppercase text-muted-foreground">Topic</Text>
          <TextInput
            value={topic}
            onChangeText={setTopic}
            multiline
            editable={canManageChannelStructure}
            className="mb-6 min-h-16 rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
          />
          {canManageChannelStructure ? (
            <Pressable
              onPress={() => void saveGeneral()}
              disabled={saving}
              className="mb-8 rounded-xl bg-primary py-3"
            >
              <Text className="text-center font-semibold text-primary-foreground">
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          ) : null}

          {canManageChannelPermissions ? (
            <>
              <Text className="mb-2 text-sm font-semibold text-foreground">Role overrides</Text>
              <Text className="mb-3 text-xs text-muted-foreground">
                Tap View / Send to cycle default → allow → deny.
              </Text>
              {roleRows.map((row) => (
                <View
                  key={row.roleId}
                  className="mb-4 rounded-xl border border-border bg-surface-panel p-3"
                >
                  <View className="mb-2 flex-row items-center gap-2">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <Text className="font-medium text-foreground">{row.name}</Text>
                  </View>
                  <View className="flex-row gap-4">
                    <Pressable
                      className="flex-1 rounded-lg bg-surface-embedded px-2 py-2"
                      onPress={() => {
                        const nv = cycle(row.canView);
                        setRoleRows((prev) =>
                          prev.map((r) => (r.roleId === row.roleId ? { ...r, canView: nv } : r)),
                        );
                        void saveRoleRow(row.roleId, {
                          canView: nv,
                          canSend: row.canSend,
                          canManage: null,
                        });
                      }}
                    >
                      <Text className="text-[10px] uppercase text-muted-foreground">View</Text>
                      <Text className="text-sm text-foreground">
                        {row.canView === null ? "Default" : row.canView ? "Allow" : "Deny"}
                      </Text>
                    </Pressable>
                    <Pressable
                      className="flex-1 rounded-lg bg-surface-embedded px-2 py-2"
                      onPress={() => {
                        const ns = cycle(row.canSend);
                        setRoleRows((prev) =>
                          prev.map((r) => (r.roleId === row.roleId ? { ...r, canSend: ns } : r)),
                        );
                        void saveRoleRow(row.roleId, {
                          canView: row.canView,
                          canSend: ns,
                          canManage: null,
                        });
                      }}
                    >
                      <Text className="text-[10px] uppercase text-muted-foreground">Send</Text>
                      <Text className="text-sm text-foreground">
                        {row.canSend === null ? "Default" : row.canSend ? "Allow" : "Deny"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
