import { Text, View } from "react-native";
import { useStore } from "@mobile-data";
import { ChannelChat } from "@/features/community/ChannelChat";

/** The open conversation, or a prompt to pick one. */
export function DmChatSurface() {
  const channelId = useStore("session", (s) =>
    s.place?.kind === "conversation" ? s.place.channel_id : null,
  );
  if (!channelId) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-sm text-muted-foreground">
          Pick a conversation from your inbox, or start one from someone's
          profile.
        </Text>
      </View>
    );
  }
  return <ChannelChat channelId={channelId} communityId={null} />;
}
