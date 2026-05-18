import { Ionicons } from "@expo/vector-icons";
import type { Channel } from "@shared/lib/backend/types";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

type CommunityChannelDrawerProps = {
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
  onPressAllCommunities: () => void;
};

export function CommunityChannelDrawer({
  communityName,
  channels,
  selectedChannelId,
  onSelectTextChannel,
  onPressAllCommunities,
}: CommunityChannelDrawerProps) {
  return (
    <View className="flex-1 border-r border-border-panel bg-surface-modal">
      <View className="border-b border-border-panel px-4 pb-3 pt-4">
        <Pressable
          accessibilityRole="button"
          className="mb-3 flex-row items-center gap-2 rounded-xl px-2 py-2.5 active:bg-surface-hover"
          onPress={onPressAllCommunities}
        >
          <Ionicons name="chevron-back" size={18} color="#a9b8cf" />
          <Text className="text-sm font-medium text-muted-foreground">All communities</Text>
        </Pressable>
        <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
          {communityName}
        </Text>
      </View>

      <ScrollView className="flex-1 px-3 pb-6" showsVerticalScrollIndicator={false}>
        {channels.length === 0 ? (
          <Text className="py-2 text-sm text-muted-foreground">No channels available.</Text>
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
                    Alert.alert(
                      "Voice on mobile",
                      "We're not there yet, but soon enough you'll be voice chatting on mobile! We appreciate your patience.",
                      [{ text: "OK" }],
                    );
                    return;
                  }
                  onSelectTextChannel(channel.id);
                }}
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
    </View>
  );
}
