import { Ionicons } from "@expo/vector-icons";
import type { Channel } from "@shared/lib/backend/types";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { CommunityManagementEntry } from "@/features/community/management/CommunityManagementEntry";

type CommunityChannelDrawerProps = {
  serverId: string;
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
};

export function CommunityChannelDrawer({
  serverId,
  communityName,
  channels,
  selectedChannelId,
  onSelectTextChannel,
}: CommunityChannelDrawerProps) {
  const initial = communityName.trim().charAt(0).toUpperCase() || "?";

  return (
    <View className="flex-1 border-r border-border-panel bg-surface-modal">
      {/* Community identity header — no safe-area padding; the persistent top bar above owns that */}
      <View className="border-b border-border-panel px-4 pb-4 pt-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-surface-panel">
            <Text className="text-base font-bold text-foreground">{initial}</Text>
          </View>
          <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={2}>
            {communityName}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {channels.length === 0 ? (
          <Text className="py-4 text-sm text-muted-foreground">No channels yet.</Text>
        ) : (
          channels.map((channel) => {
            const active = selectedChannelId === channel.id;
            const isVoice = channel.kind === "voice";
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                className={`flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                  active ? "bg-surface-panel" : "active:bg-surface-hover"
                }`}
                onPress={() => {
                  if (isVoice) {
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
                <Ionicons
                  name={isVoice ? "volume-medium-outline" : "chatbox-outline"}
                  size={16}
                  color={active ? "#e6edf7" : "#6b7a90"}
                />
                <Text
                  className={`flex-1 text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                  numberOfLines={1}
                >
                  {channel.name}
                </Text>
                {active ? <Ionicons name="checkmark" size={15} color="#e6edf7" /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <CommunityManagementEntry
        serverId={serverId}
        communityName={communityName}
        channels={channels}
      />
    </View>
  );
}
