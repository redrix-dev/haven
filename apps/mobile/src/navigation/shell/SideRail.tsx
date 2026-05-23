import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import {
  type SideRailGlowPattern,
  useSideRailChromeStore,
} from "@/navigation/shell/sideRailChromeStore";

const RAIL_WIDTH = 96;
const EDGE_HITBOX_WIDTH = 28;
const RAIL_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };
const SCRIM_MAX_OPACITY = 0.45;
const EDGE_LINE_WIDTH = StyleSheet.hairlineWidth;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SideRailProps = {
  onOpenNotifications: () => void;
  onOpenInbox: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
};

type RailButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function getGlowPatternMultiplier(
  pattern: SideRailGlowPattern,
  phase: number,
  segmentPosition: number,
) {
  "worklet";

  if (pattern === "steady") return 1;
  if (pattern === "pulse") return 0.25 + phase * 0.75;
  if (pattern === "breathe") return 0.45 + phase * 0.55;

  const distance = Math.abs(phase - segmentPosition);
  const wrappedDistance = Math.min(distance, 1 - distance);
  return Math.max(0.16, 1 - wrappedDistance * 4);
}

function RailButton({ icon, onPress }: RailButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.railButton,
        pressed ? styles.railButtonPressed : null,
      ]}
    >
      <Ionicons name={icon} size={28} color="#e6edf7" />
    </Pressable>
  );
}

export function SideRail({
  onOpenNotifications,
  onOpenInbox,
  onOpenProfile,
  onOpenSettings,
}: SideRailProps) {
  const insets = useSafeAreaInsets();
  const edgeGlowEnabled = useSideRailChromeStore((s) => s.edgeGlowEnabled);
  const edgeGlowColor = useSideRailChromeStore((s) => s.edgeGlowColor);
  const edgeGlowIntensity = useSideRailChromeStore((s) => s.edgeGlowIntensity);
  const edgeGlowPattern = useSideRailChromeStore((s) => s.edgeGlowPattern);
  const edgeGlowSegments = useSideRailChromeStore((s) => s.edgeGlowSegments);
  const [open, setOpen] = useState(false);
  const translateX = useSharedValue(RAIL_WIDTH);
  const dragStartX = useSharedValue(RAIL_WIDTH);
  const glowPhase = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(glowPhase);

    if (!edgeGlowEnabled || edgeGlowPattern === "steady") {
      glowPhase.value = 1;
      return;
    }

    if (edgeGlowPattern === "scan") {
      glowPhase.value = 0;
      glowPhase.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.linear }),
        -1,
        false,
      );
      return;
    }

    glowPhase.value = 0;
    glowPhase.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: edgeGlowPattern === "pulse" ? 520 : 1500,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: edgeGlowPattern === "pulse" ? 520 : 1500,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      false,
    );
  }, [edgeGlowEnabled, edgeGlowPattern, glowPhase]);

  const setRailOpen = useCallback(() => {
    setOpen(true);
  }, []);
  const setRailClosed = useCallback(() => {
    setOpen(false);
  }, []);

  const close = useCallback(() => {
    translateX.value = withTiming(RAIL_WIDTH, RAIL_TIMING, (finished) => {
      if (finished) {
        scheduleOnRN(setRailClosed);
      }
    });
  }, [setRailClosed, translateX]);

  const launch = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close],
  );

  const edgeSwipeGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragStartX.value = RAIL_WIDTH;
      translateX.value = RAIL_WIDTH;
    })
    .onUpdate((event) => {
      if (event.translationX >= 0) return;
      translateX.value = Math.max(
        0,
        Math.min(RAIL_WIDTH, RAIL_WIDTH + event.translationX),
      );
    })
    .onEnd((event) => {
      const shouldOpen =
        translateX.value < RAIL_WIDTH * 0.65 || event.velocityX < -350;
      if (shouldOpen) {
        scheduleOnRN(setRailOpen);
      }
      translateX.value = withTiming(
        shouldOpen ? 0 : RAIL_WIDTH,
        RAIL_TIMING,
        (finished) => {
          if (finished && !shouldOpen) {
            scheduleOnRN(setRailClosed);
          }
        },
      );
    });

  const createCloseDragGesture = () =>
    Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onStart(() => {
        dragStartX.value = translateX.value;
      })
      .onUpdate((event) => {
        translateX.value = Math.max(
          0,
          Math.min(RAIL_WIDTH, dragStartX.value + event.translationX),
        );
      })
      .onEnd((event) => {
        const shouldClose =
          translateX.value > RAIL_WIDTH * 0.45 || event.velocityX > 350;
        translateX.value = withTiming(
          shouldClose ? RAIL_WIDTH : 0,
          RAIL_TIMING,
          (finished) => {
            if (finished && shouldClose) {
              scheduleOnRN(setRailClosed);
            }
          },
        );
      });

  const scrimDragGesture = createCloseDragGesture();
  const railDragGesture = createCloseDragGesture();

  const animatedRailStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedScrimStyle = useAnimatedStyle(() => {
    const openProgress = 1 - translateX.value / RAIL_WIDTH;
    return {
      opacity: openProgress * SCRIM_MAX_OPACITY,
    };
  });

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity:
      edgeGlowEnabled && edgeGlowSegments.top
        ? (translateX.value / RAIL_WIDTH) *
          edgeGlowIntensity *
          getGlowPatternMultiplier(edgeGlowPattern, glowPhase.value, 0.1)
        : 0,
  }));

  const middleGlowStyle = useAnimatedStyle(() => ({
    opacity:
      edgeGlowEnabled && edgeGlowSegments.middle
        ? (translateX.value / RAIL_WIDTH) *
          edgeGlowIntensity *
          getGlowPatternMultiplier(edgeGlowPattern, glowPhase.value, 0.5)
        : 0,
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    opacity:
      edgeGlowEnabled && edgeGlowSegments.bottom
        ? (translateX.value / RAIL_WIDTH) *
          edgeGlowIntensity *
          getGlowPatternMultiplier(edgeGlowPattern, glowPhase.value, 0.9)
        : 0,
  }));

  const baseGlowStyle = useAnimatedStyle(() => {
    const hasActiveSegment =
      edgeGlowSegments.top || edgeGlowSegments.middle || edgeGlowSegments.bottom;

    return {
      opacity: edgeGlowEnabled && hasActiveSegment
        ? (translateX.value / RAIL_WIDTH) * edgeGlowIntensity * 0.38
        : 0,
    };
  });

  const renderEdgeGlowSegment = (
    key: string,
    animatedStyle: ReturnType<typeof useAnimatedStyle>,
    zoneStyle: object,
  ) => (
    <Animated.View
      key={key}
      style={[
        styles.edgeGlowZone,
        zoneStyle,
        { backgroundColor: edgeGlowColor },
        animatedStyle,
      ]}
    />
  );

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.rootOverlay]}
    >
      <View pointerEvents="none" style={styles.edgeGlowContainer}>
        <Animated.View
          style={[
            styles.edgeGlowBaseLine,
            { backgroundColor: edgeGlowColor },
            baseGlowStyle,
          ]}
        />
        {renderEdgeGlowSegment("top", topGlowStyle, styles.edgeGlowZoneTop)}
        {renderEdgeGlowSegment(
          "middle",
          middleGlowStyle,
          styles.edgeGlowZoneMiddle,
        )}
        {renderEdgeGlowSegment(
          "bottom",
          bottomGlowStyle,
          styles.edgeGlowZoneBottom,
        )}
      </View>

      <GestureDetector gesture={scrimDragGesture}>
        <AnimatedPressable
          pointerEvents={open ? "auto" : "none"}
          style={[styles.scrim, animatedScrimStyle]}
          onPress={close}
        />
      </GestureDetector>

      <GestureDetector gesture={railDragGesture}>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[
            styles.rail,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
            animatedRailStyle,
          ]}
        >
          <View style={styles.buttonGrid}>
            <RailButton
              icon="notifications-outline"
              onPress={() => launch(onOpenNotifications)}
            />
            <RailButton icon="mail-outline" onPress={() => launch(onOpenInbox)} />
            <RailButton
              icon="person-circle-outline"
              onPress={() => launch(onOpenProfile)}
            />
            <RailButton
              icon="settings-outline"
              onPress={() => launch(onOpenSettings)}
            />
          </View>
        </Animated.View>
      </GestureDetector>

      <GestureDetector gesture={edgeSwipeGesture}>
        <View style={styles.rightEdgeHitbox} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  rootOverlay: {
    zIndex: 1000,
    elevation: 1000,
  },
  rightEdgeHitbox: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: EDGE_HITBOX_WIDTH,
    zIndex: 80,
  },
  edgeGlowContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 70,
    width: 8,
  },
  edgeGlowBaseLine: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: EDGE_LINE_WIDTH,
  },
  edgeGlowZone: {
    position: "absolute",
    right: 0,
    width: EDGE_LINE_WIDTH,
  },
  edgeGlowZoneTop: {
    top: 0,
    height: "46%",
  },
  edgeGlowZoneMiddle: {
    top: "27%",
    height: "46%",
  },
  edgeGlowZoneBottom: {
    bottom: 0,
    height: "46%",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
    backgroundColor: "#000",
  },
  rail: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    width: RAIL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  buttonGrid: {
    alignItems: "center",
    justifyContent: "center",
  },
  railButton: {
    width: 64,
    height: 64,
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  railButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
});
