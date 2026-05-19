import { useCallback, useEffect, useState } from "react";
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
import { getCommunityDataBackend } from "@shared/lib/backend";
import type { Channel, ChannelPermissionState } from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

type MobileChannelSettingsModalProps = {
  visible: boolean;
  onDismiss: () => void;
  communityId: string | null;
  channel: Channel | null;
  currentUserId: string | null;
  canManageChannelStructure: boolean;
  canManageChannelPermissions: boolean;
};

export function MobileChannelSettingsModal({
  visible,
  onDismiss,
  communityId,
  channel,
  currentUserId,
  canManageChannelStructure,
  canManageChannelPermissions,
}: MobileChannelSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
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

  const load = useCallback(async () => {
    if (!communityId || !channel?.id || !currentUserId) return;
    setLoading(true);
    try {
      const backend = getCommunityDataBackend(communityId);
      const snap = await backend.fetchChannelPermissions({
        communityId,
        channelId: channel.id,
        userId: currentUserId,
      });
      setName(channel.name);
      setTopic(channel.topic ?? "");
      setRoleRows(
        snap.rolePermissions.map((r) => ({
          roleId: r.roleId,
          name: r.name,
          color: r.color,
          canView: r.canView,
          canSend: r.canSend,
        })),
      );
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Failed to load channel settings."));
    } finally {
      setLoading(false);
    }
  }, [channel, communityId, currentUserId]);

  useEffect(() => {
    if (visible && channel) void load();
  }, [visible, channel, load]);

  const saveGeneral = async () => {
    if (!communityId || !channel) return;
    setSaving(true);
    try {
      const backend = getCommunityDataBackend(communityId);
      await backend.updateChannel({
        communityId,
        channelId: channel.id,
        name: name.trim(),
        topic: topic.trim() || null,
      });
      Alert.alert("Saved", "Channel updated.");
      onDismiss();
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not save channel."));
    } finally {
      setSaving(false);
    }
  };

  const saveRoleRow = async (roleId: string, next: ChannelPermissionState) => {
    if (!communityId || !channel) return;
    try {
      const backend = getCommunityDataBackend(communityId);
      await backend.saveRoleChannelPermissions({
        communityId,
        channelId: channel.id,
        roleId,
        permissions: next,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", getErrorMessage(e, "Could not update permissions."));
    }
  };

  const cycle = (v: boolean | null): boolean | null => {
    if (v === null) return true;
    if (v === true) return false;
    return null;
  };

  if (!visible || !channel) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View className="flex-1 bg-card pt-14">
        <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
          <Text className="text-lg font-semibold text-foreground">#{channel.name}</Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text className="text-lg text-muted-foreground">Done</Text>
          </Pressable>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#e6edf7" />
          </View>
        ) : (
          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
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
              className="mb-6 min-h-[72px] rounded-xl border border-border bg-surface-panel px-3 py-3 text-foreground"
            />
            {canManageChannelStructure ? (
              <Pressable
                onPress={() => void saveGeneral()}
                disabled={saving}
                className="mb-8 rounded-xl bg-primary py-3"
              >
                <Text className="text-center font-semibold text-white">{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            ) : null}

            {canManageChannelPermissions ? (
              <>
                <Text className="mb-2 text-sm font-semibold text-foreground">Role overrides</Text>
                <Text className="mb-3 text-xs text-muted-foreground">
                  Tap View / Send to cycle default → allow → deny. Matches desktop channel permission columns.
                </Text>
                {roleRows.map((row) => (
                  <View key={row.roleId} className="mb-4 rounded-xl border border-border bg-surface-panel p-3">
                    <View className="mb-2 flex-row items-center gap-2">
                      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
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
    </Modal>
  );
}
