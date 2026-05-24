import { Ionicons } from "@expo/vector-icons";
import { Dimensions, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

// Must match DRAWER_WIDTH in CommunityShell.
const DRAWER_WIDTH = Math.min(320, Dimensions.get("window").width * 0.86);
const HEADER_ROW_HEIGHT = 44;

type CommunityTopBarProps = {
  communityName: string;
  selectedChannelName: string;
  drawerOpen: boolean;
  drawerOffset: SharedValue<number>;
  onPressCommunity: () => void;
  onPressChannel: () => void;
  onPressBack: () => void;
};

export function CommunityTopBar({
  communityName,
  selectedChannelName,
  drawerOpen,
  drawerOffset,
  onPressCommunity,
  onPressChannel,
  onPressBack,
}: CommunityTopBarProps) {
  const insets = useSafeAreaInsets();

  // Closed-state content: visible when drawer is closed, slides down and fades as drawer opens.
  const closedStyle = useAnimatedStyle(() => {
    "worklet";
    const opacity = interpolate(
      drawerOffset.value,
      [-DRAWER_WIDTH, -DRAWER_WIDTH * 0.4],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      drawerOffset.value,
      [-DRAWER_WIDTH, -DRAWER_WIDTH * 0.4],
      [0, 14],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  // Open-state content: hidden when drawer is closed, slides in from above as drawer opens.
  const openStyle = useAnimatedStyle(() => {
    "worklet";
    const opacity = interpolate(
      drawerOffset.value,
      [-DRAWER_WIDTH * 0.6, 0],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      drawerOffset.value,
      [-DRAWER_WIDTH * 0.6, 0],
      [-14, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top }}
    >
      {/* Fixed-height row with overflow:hidden to clip the vertical slide travel */}
      <View style={{ height: HEADER_ROW_HEIGHT, overflow: "hidden" }}>
        {/* Closed state — community name left, channel selector center/right */}
        <Animated.View
          pointerEvents={drawerOpen ? "none" : "auto"}
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: HEADER_ROW_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
            },
            closedStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Community ${communityName}, open channel list`}
            className="flex-1 rounded-lg px-2 py-2 active:bg-surface-hover"
            onPress={onPressCommunity}
          >
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
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
              className="max-w-[120px] text-sm font-semibold text-foreground"
              numberOfLines={1}
            >
              {selectedChannelName}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#a9b8cf" />
          </Pressable>
        </Animated.View>

        {/* Open state — back affordance left, room for future right action */}
        <Animated.View
          pointerEvents={drawerOpen ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: HEADER_ROW_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
            },
            openStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to all communities"
            className="flex-row items-center gap-1 rounded-lg px-2 py-2 active:bg-surface-hover"
            onPress={onPressBack}
          >
            <Ionicons name="chevron-back" size={18} color="#a9b8cf" />
            <Text className="text-sm font-medium text-muted-foreground">Communities</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
