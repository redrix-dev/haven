import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type CommunityChannelBarProps = {
  communityName: string;
  selectedChannelName: string;
  onPressCommunity: () => void;
  onPressSelectedChannel: () => void;
};

export function CommunityChannelBar({
  communityName,
  selectedChannelName,
  onPressCommunity,
  onPressSelectedChannel,
}: CommunityChannelBarProps) {
  return (
    <View className="flex-row items-center border-b border-border-panel bg-surface-modal px-3 py-2">
      <Pressable
        accessibilityRole="button"
        className="max-w-[44%] rounded-lg px-2 py-2 active:bg-surface-hover"
        onPress={onPressCommunity}
      >
        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
          {communityName}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        className="mx-2 min-w-0 flex-1 flex-row items-center justify-center rounded-lg px-2 py-2 active:bg-surface-hover"
        onPress={onPressSelectedChannel}
      >
        <Text className="mr-1 text-sm text-muted-foreground">#</Text>
        <Text className="min-w-0 flex-shrink text-sm font-semibold text-foreground" numberOfLines={1}>
          {selectedChannelName}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#a9b8cf" />
      </Pressable>
    </View>
  );
}
