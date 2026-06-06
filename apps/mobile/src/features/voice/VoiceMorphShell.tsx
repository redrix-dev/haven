import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type VoiceMorphShellProps = {
  visible: boolean;
  /**
   * Shared 0→1 transition progress owned by the parent (0 = collapsed bubble,
   * 1 = fully revealed panel). Both this shell and the floating bubble read the
   * same value so they morph in lockstep instead of animating independently.
   */
  progress: SharedValue<number>;
  /** Screen-space center of the bubble the panel grows from / collapses toward. */
  anchor: { x: number; y: number } | null;
  title?: string;
  /** Height/sizing classes on the card (e.g. `h-[92%]`). */
  cardClassName?: string;
  onDismiss: () => void;
  children: React.ReactNode;
};

const MIN_CARD_SCALE = 0.7;

export function VoiceMorphShell({
  visible,
  progress,
  anchor,
  title,
  cardClassName,
  onDismiss,
  children,
}: VoiceMorphShellProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Keep the modal mounted through the collapse animation; unmount once the
  // shared progress has fully returned to 0 (mirrors HavenModalShell's pattern,
  // but driven by the externally-owned progress value).
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useAnimatedReaction(
    () => progress.value,
    (value) => {
      if (!visible && value <= 0.001) {
        runOnJS(setMounted)(false);
      }
    },
    [visible],
  );

  // The card is a bottom-anchored sheet; its visual center sits a little below
  // the screen midpoint. Growing from / collapsing toward the bubble anchor is
  // an approximate translate from that rest center to the anchor.
  const restCenterX = windowWidth / 2;
  const restCenterY = windowHeight * 0.54;
  const anchorX = anchor?.x ?? restCenterX;
  const anchorY = anchor?.y ?? windowHeight - insets.bottom;

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.5, 1], [0, 0.65, 1]),
      transform: [
        { translateX: interpolate(p, [0, 1], [anchorX - restCenterX, 0]) },
        { translateY: interpolate(p, [0, 1], [anchorY - restCenterY, 0]) },
        { scale: interpolate(p, [0, 1], [MIN_CARD_SCALE, 1]) },
      ],
    };
  });

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onDismiss}
    >
      <View className="flex-1 justify-end" pointerEvents={visible ? "auto" : "none"}>
        {/* Scrim — fades independently */}
        {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal scrim overlay, invariant across all themes */}
        <Animated.View className="absolute inset-0 bg-black/50" style={scrimStyle} pointerEvents="none" />
        <Pressable className="absolute inset-0" onPress={onDismiss} />

        <Animated.View
          className={cn(
            "rounded-t-3xl border-t border-border bg-card px-6 pt-6",
            cardClassName,
          )}
          style={[cardStyle, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        >
          {title ? (
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">{title}</Text>
              <Pressable onPress={onDismiss} hitSlop={12}>
                <Text className="text-lg text-muted-foreground">✕</Text>
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
