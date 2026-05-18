import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CommunityTopBarProps = {
  communityName: string;
  selectedChannelName: string;
  onPressCommunity: () => void;
  onPressChannel: () => void;
};

export function CommunityTopBar({
  communityName,
  selectedChannelName,
  onPressCommunity,
  onPressChannel,
}: CommunityTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top + 4 }}
    >
      <View className="flex-row items-center px-3 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Community ${communityName}, open channel list`}
          className="max-w-[44%] rounded-lg px-2 py-2 active:bg-surface-hover"
          onPress={onPressCommunity}
        >
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {communityName}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Channel ${selectedChannelName}, open channel list`}
          className="mx-2 min-w-0 flex-1 flex-row items-center justify-center rounded-lg px-2 py-2 active:bg-surface-hover"
          onPress={onPressChannel}
        >
          <Text className="mr-1 text-sm text-muted-foreground">#</Text>
          <Text className="min-w-0 flex-shrink text-sm font-semibold text-foreground" numberOfLines={1}>
            {selectedChannelName}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#a9b8cf" />
        </Pressable>
      </View>
    </View>
  );
}
