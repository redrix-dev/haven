import type { Channel } from "@shared/lib/backend/types";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ThemedIonicons } from "@/theme-rn";

type ChannelSwitcherModalProps = {
  visible: boolean;
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
  onSelectVoiceChannel?: (channelId: string) => void;
  onRequestClose: () => void;
  /** Opens mobile channel settings for a text channel (gear icon). */
  onOpenChannelSettings?: (channelId: string) => void;
};

export function ChannelSwitcherModal({
  visible,
  communityName,
  channels,
  selectedChannelId,
  onSelectTextChannel,
  onSelectVoiceChannel,
  onRequestClose,
  onOpenChannelSettings,
}: ChannelSwitcherModalProps) {
  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <View className="flex-1 justify-end bg-background/75">
        <Pressable className="flex-1" onPress={onRequestClose} />
        <View className="max-h-[70%] rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-6 pt-3">
          <View className="mb-3 flex-row items-center justify-between">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {communityName}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-lg bg-surface-panel active:bg-surface-hover"
              onPress={onRequestClose}
            >
              <ThemedIonicons
                name="close"
                size={18}
                colorClassName="accent-foreground"
              />
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
                    onPress={() => {
                      if (channel.kind === "voice") {
                        onSelectVoiceChannel?.(channel.id);
                        onRequestClose();
                        return;
                      }
                      onSelectTextChannel(channel.id);
                      onRequestClose();
                    }}
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      {channel.kind === "voice" ? (
                        <ThemedIonicons
                          name="volume-medium-outline"
                          size={16}
                          colorClassName={
                            active ? "accent-foreground" : "accent-text-dim"
                          }
                        />
                      ) : (
                        <Text
                          className={
                            active ? "text-foreground" : "text-muted-foreground"
                          }
                        >
                          #
                        </Text>
                      )}
                      <Text
                        className={
                          active ? "text-foreground" : "text-muted-foreground"
                        }
                        numberOfLines={1}
                      >
                        {channel.name}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      {channel.kind === "text" && onOpenChannelSettings ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Channel settings"
                          hitSlop={8}
                          onPress={() => onOpenChannelSettings(channel.id)}
                        >
                          <ThemedIonicons
                            name="settings-outline"
                            size={18}
                            colorClassName="accent-text-dim"
                          />
                        </Pressable>
                      ) : null}
                      {active ? (
                        <ThemedIonicons
                          name="checkmark"
                          size={18}
                          colorClassName="accent-foreground"
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
