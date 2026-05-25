import type { Channel } from "@shared/lib/backend/types";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { CommunityManagementEntry } from "@/features/community/management/CommunityManagementEntry";
import { ThemedIonicons } from "@/theme-rn";

type CommunityChannelDrawerProps = {
  serverId: string | null;
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectTextChannel: (channelId: string) => void;
  onCreateCommunity: () => void;
  onJoinCommunity: () => void;
};

export function CommunityChannelDrawer({
  serverId,
  communityName,
  channels,
  selectedChannelId,
  onSelectTextChannel,
  onCreateCommunity,
  onJoinCommunity,
}: CommunityChannelDrawerProps) {
  const initial = communityName.trim().charAt(0).toUpperCase() || "?";

  if (!serverId) {
    return (
      <View className="flex-1 border-r border-border-panel bg-surface-modal">
        <View className="border-b border-border-panel px-4 pb-4 pt-4">
          <Text className="text-base font-semibold text-foreground">Communities</Text>
        </View>
        <View className="flex-1 justify-center px-5">
          <Text className="text-xl font-bold text-foreground">Start with a community</Text>
          <Text className="mt-2 text-sm leading-5 text-muted-foreground">
            Create your own server or join one with an invite to see channels here.
          </Text>
          <View className="mt-5 gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onCreateCommunity}
              className="rounded-xl bg-primary px-4 py-3 active:bg-primary-hover"
            >
              <Text className="text-center font-semibold text-primary-foreground">
                Create community
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onJoinCommunity}
              className="rounded-xl border border-border-control bg-surface-panel px-4 py-3 active:bg-surface-hover"
            >
              <Text className="text-center font-semibold text-foreground">
                Join community
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

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
                <ThemedIonicons
                  name={isVoice ? "volume-medium-outline" : "chatbox-outline"}
                  size={16}
                  colorClassName={active ? "accent-foreground" : "accent-text-dim"}
                />
                <Text
                  className={`flex-1 text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                  numberOfLines={1}
                >
                  {channel.name}
                </Text>
                {active ? (
                  <ThemedIonicons
                    name="checkmark"
                    size={15}
                    colorClassName="accent-foreground"
                  />
                ) : null}
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
