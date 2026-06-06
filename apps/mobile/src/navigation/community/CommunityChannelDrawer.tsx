import type { Channel } from "@shared/lib/backend/types";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommunityManagementEntry } from "@/features/community/management/CommunityManagementEntry";
import { ThemedIonicons } from "@/theme-rn";

type CommunityChannelDrawerProps = {
  serverId: string | null;
  communityName: string;
  channels: Channel[];
  selectedChannelId: string | null;
  activeVoiceChannelId: string | null;
  voiceChannelParticipants: Record<string, VoiceSidebarParticipant[]>;
  onSelectTextChannel: (channelId: string) => void;
  onSelectVoiceChannel: (channelId: string) => void;
  onOpenVoiceSession: () => void;
  onCreateCommunity: () => void;
  onJoinCommunity: () => void;
};

function participantInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

function VoiceParticipantRow({
  participant,
}: {
  participant: VoiceSidebarParticipant;
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-lg px-2 py-1.5">
      <View
        className={[
          "h-6 w-6 items-center justify-center overflow-hidden rounded-full border bg-surface-panel",
          participant.isSpeaking ? "border-primary" : "border-border-panel",
        ].join(" ")}
      >
        {participant.avatarUrl ? (
          <Image source={{ uri: participant.avatarUrl }} className="h-full w-full rounded-full" />
        ) : (
          <Text className="text-xs font-bold text-foreground">
            {participantInitial(participant.displayName)}
          </Text>
        )}
      </View>
      <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
        {participant.displayName}
      </Text>
      {participant.isSpeaking ? (
        <View className="h-2 w-2 rounded-full bg-primary" />
      ) : null}
    </View>
  );
}

export function CommunityChannelDrawer({
  serverId,
  communityName,
  channels,
  selectedChannelId,
  activeVoiceChannelId,
  voiceChannelParticipants,
  onSelectTextChannel,
  onSelectVoiceChannel,
  onOpenVoiceSession,
  onCreateCommunity,
  onJoinCommunity,
}: CommunityChannelDrawerProps) {
  const insets = useSafeAreaInsets();
  const initial = communityName.trim().charAt(0).toUpperCase() || "?";

  if (!serverId) {
    return (
      <View className="flex-1 border-r border-border-panel bg-surface-modal">
        <View
          className="border-b border-border-panel px-4 pb-4"
          style={{ paddingTop: insets.top + 16 }}
        >
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
      <View
        className="border-b border-border-panel px-4 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
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
            const isVoice = channel.kind === "voice";
            const active = isVoice
              ? activeVoiceChannelId === channel.id
              : selectedChannelId === channel.id;
            const participants = isVoice ? (voiceChannelParticipants[channel.id] ?? []) : [];
            const participantCount = participants.length;
            return (
              <View key={channel.id} className="mb-1">
                <Pressable
                  accessibilityRole="button"
                  className={`flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                    active ? "bg-surface-panel" : "active:bg-surface-hover"
                  }`}
                  onPress={() => {
                    if (isVoice) {
                      if (activeVoiceChannelId === channel.id) {
                        onOpenVoiceSession();
                      } else {
                        onSelectVoiceChannel(channel.id);
                      }
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
                  {isVoice && participantCount > 0 ? (
                    <Text className="text-xs font-semibold text-muted-foreground">
                      {participantCount}
                    </Text>
                  ) : null}
                  {active ? (
                    <ThemedIonicons
                      name="checkmark"
                      size={15}
                      colorClassName="accent-foreground"
                    />
                  ) : null}
                </Pressable>
                {isVoice && participants.length > 0 ? (
                  <View className="ml-8 mt-1 gap-0.5">
                    {participants.map((participant) => (
                      <VoiceParticipantRow
                        key={participant.userId}
                        participant={participant}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
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
