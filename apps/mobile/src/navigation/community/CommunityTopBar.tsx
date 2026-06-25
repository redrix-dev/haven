import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedIonicons } from "@/theme-rn";

const HEADER_MIN_HEIGHT = 58;

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

  // Community name and current channel each get their own full-width line so
  // both can grow larger without competing for horizontal space and truncating.
  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top }}
    >
      <View
        style={{
          minHeight: HEADER_MIN_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
        className="py-1.5"
      >
        <View className="min-w-0 flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Community ${communityName}, open channel list`}
            className="max-w-full self-start rounded-lg px-2 py-0.5 active:bg-surface-hover"
            onPress={onPressCommunity}
          >
            <Text
              className="text-base font-semibold leading-5 text-muted-foreground"
              numberOfLines={1}
            >
              {communityName}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Channel ${selectedChannelName}, open channel list`}
            className="mt-0.5 max-w-full flex-row items-center gap-1 self-start rounded-lg px-2 py-0.5 active:bg-surface-hover"
            onPress={onPressChannel}
          >
            <Text className="text-xl font-bold text-muted-foreground">#</Text>
            <Text
              className="shrink text-xl font-bold leading-7 text-foreground"
              numberOfLines={1}
            >
              {selectedChannelName}
            </Text>
            <ThemedIonicons
              name="chevron-down"
              size={18}
              colorClassName="accent-muted-foreground"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
