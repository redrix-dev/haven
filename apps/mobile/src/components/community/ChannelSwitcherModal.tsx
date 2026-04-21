import { Ionicons } from "@expo/vector-icons";
import type { Channel } from "@shared/lib/backend/types";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

type ChannelSwitcherModalProps = {
  visible: boolean;
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onRequestClose: () => void;
  onCreateChannel: () => void;
};

export function ChannelSwitcherModal({
  visible,
  communityName,
  channels,
  selectedChannelId,
  onSelectChannel,
  onRequestClose,
  onCreateChannel,
}: ChannelSwitcherModalProps) {
  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={onRequestClose} />
        <View className="max-h-[70%] rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-6 pt-3">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
              {communityName}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-lg bg-surface-panel active:bg-surface-hover"
              onPress={onRequestClose}
            >
              <Ionicons name="close" size={18} color="#e6edf7" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {channels.length === 0 ? (
              <Text className="py-2 text-sm text-muted-foreground">
                No channels available.
              </Text>
            ) : (
              channels.map((channel) => {
                const active = selectedChannelId === channel.id;
                return (
                  <Pressable
                    key={channel.id}
                    accessibilityRole="button"
                    className={`mb-2 flex-row items-center justify-between rounded-xl px-3 py-3 ${
                      active ? "bg-surface-panel" : "bg-surface-embedded"
                    }`}
                    onPress={() => onSelectChannel(channel.id)}
                  >
                    <Text className={active ? "text-foreground" : "text-muted-foreground"}>
                      {channel.kind === "voice" ? "🔊 " : "# "}
                      {channel.name}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color="#e6edf7" /> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            className="mt-3 rounded-xl border border-border-control px-3 py-3 active:bg-surface-hover"
            onPress={onCreateChannel}
          >
            <Text className="text-center font-medium text-foreground">Create channel (WIP)</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
