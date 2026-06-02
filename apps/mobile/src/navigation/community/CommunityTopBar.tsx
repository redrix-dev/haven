import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedIonicons } from "@/theme-rn";

const HEADER_ROW_HEIGHT = 44;

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
      style={{ paddingTop: insets.top }}
    >
      <View
        style={{
          minHeight: HEADER_ROW_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
        className="py-1"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Community ${communityName}, open channel list`}
          className="flex-1 rounded-lg px-2 py-2 active:bg-surface-hover"
          onPress={onPressCommunity}
        >
          <Text className="text-sm font-semibold leading-5 text-foreground" numberOfLines={2}>
            {communityName}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Channel ${selectedChannelName}, open channel list`}
          className="ml-1 flex-row items-center gap-0.5 rounded-lg px-2 py-2 active:bg-surface-hover"
          onPress={onPressChannel}
        >
          <Text className="text-sm text-muted-foreground">#</Text>
          <Text
            className="max-w-30 text-sm font-semibold leading-5 text-foreground"
            numberOfLines={2}
          >
            {selectedChannelName}
          </Text>
          <ThemedIonicons
            name="chevron-down"
            size={16}
            colorClassName="accent-muted-foreground"
          />
        </Pressable>
      </View>
    </View>
  );
}
