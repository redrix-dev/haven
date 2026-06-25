import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withClamp,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedIonicons, type ThemedIoniconsProps } from "@/theme-rn";
import type {
  MobileVoiceControllerActions,
  MobileVoiceControllerState,
} from "@/features/voice/useMobileLiveKitVoiceSession";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

const BUBBLE_SIZE = 60;
const EDGE_MARGIN = 12;
const CONTROL_SIZE = 48;
const CONTROL_GAP = 8;
const CONTROL_CLUSTER_GAP = 10;
const THROW_PROJECTION_S = 0.14;
const VERTICAL_VELOCITY_WEIGHT = 0.35;
const CORNER_THROW_STRENGTH = 580;
const CONTROL_COUNT = 4;

const DRAG_SPRING = {
  stiffness: 368,
  damping: 18,
  mass: 1,
  overshootClamping: false,
} as const;

const THROW_SETTLE_SPRING = {
  stiffness: 52,
  damping: 20,
  mass: 1.15,
  overshootClamping: false,
} as const;

type VoiceFloatingControllerProps = {
  visible: boolean;
  state: MobileVoiceControllerState;
  actions: MobileVoiceControllerActions;
  onLeave: () => void;
  onOpenFullSheet: () => void;
  /**
   * Shared 0→1 transition progress (0 = bubble, 1 = panel). When provided, the
   * bubble stays mounted while the panel is open and fades/scales toward the
   * panel in lockstep with {@link VoiceMorphShell}, instead of unmounting.
   */
  morphProgress?: SharedValue<number>;
  /** Reports the bubble's on-screen center so the panel can morph from it. */
  onRestPositionCommit?: (center: { x: number; y: number }) => void;
  /**
   * Whether the bubble is allowed to be visible/interactive. The bubble is the
   * panel's minimized form, so a fresh join keeps it suppressed (`false`) and
   * opens straight into the panel; it's armed once the panel is first minimized.
   * Defaults to `true` for callers that don't manage the morph lifecycle.
   */
  armed?: boolean;
};

type RestPosition = { x: number; y: number };
type ControlPlacement = {
  above: boolean;
  nearRightEdge: boolean;
  left: number;
  top: number;
};

type QuickControlProps = {
  label: string;
  icon: ThemedIoniconsProps["name"];
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function chooseCornerTarget(
  x: number,
  y: number,
  vx: number,
  vy: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): RestPosition {
  "worklet";
  if (Math.abs(vx) >= Math.abs(vy)) {
    return {
      x: vx >= 0 ? maxX : minX,
      y: clamp(y + vy * THROW_PROJECTION_S, minY, maxY),
    };
  }
  return {
    x: clamp(x + vx * THROW_PROJECTION_S, minX, maxX),
    y: vy >= 0 ? maxY : minY,
  };
}

function QuickControl({
  label,
  icon,
  active = false,
  destructive = false,
  disabled = false,
  onPress,
}: QuickControlProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={[
        "h-12 w-12 items-center justify-center rounded-2xl border active:opacity-85",
        destructive
          ? "border-destructive bg-destructive"
          : active
            ? "border-primary bg-primary"
            : "border-border-panel bg-surface-modal",
        disabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <ThemedIonicons
        name={icon}
        size={22}
        colorClassName={
          destructive || active
            ? "accent-primary-foreground"
            : "accent-foreground"
        }
      />
    </Pressable>
  );
}

export function VoiceFloatingController({
  visible,
  state,
  actions,
  onLeave,
  onOpenFullSheet,
  morphProgress,
  onRestPositionCommit,
  armed = true,
}: VoiceFloatingControllerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const themeTokens = useMobileThemeTokens();
  const spinnerColor =
    resolveColorProp(themeTokens, "primary-foreground") ?? "#ffffff";
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controlsMounted, setControlsMounted] = useState(false);
  const [restPosition, setRestPosition] = useState<RestPosition | null>(null);

  const layoutW = useSharedValue(width);
  const layoutH = useSharedValue(height);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const restX = useSharedValue(0);
  const restY = useSharedValue(0);
  const controlsProgress = useSharedValue(0);
  const initializedRef = useRef(false);

  const sessionActive = Boolean(
    state.activeChannel && (state.joined || state.joining),
  );
  // With a morph progress the bubble stays mounted while the panel is open so it
  // can animate out; otherwise it unmounts the moment the sheet opens.
  const active = morphProgress ? sessionActive : visible && sessionActive;
  // Dragging / tapping the bubble is only allowed when it's the visible surface
  // (sheet closed) and the bubble has been revealed (armed).
  const interactive = active && visible && armed;
  const participantCount = state.participants.length + (state.joined ? 1 : 0);

  const closeControls = useCallback(() => {
    setControlsOpen(false);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsOpen((open) => !open);
  }, []);

  const commitRestPosition = useCallback(
    (x: number, y: number) => {
      setRestPosition({ x, y });
      onRestPositionCommit?.({
        x: x + BUBBLE_SIZE / 2,
        y: y + BUBBLE_SIZE / 2,
      });
    },
    [onRestPositionCommit],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      const nextHeight = event.nativeEvent.layout.height;
      layoutW.value = nextWidth;
      layoutH.value = nextHeight;
      if (initializedRef.current || nextWidth <= 0 || nextHeight <= 0) return;

      initializedRef.current = true;
      const minX = insets.left + EDGE_MARGIN;
      const maxX = nextWidth - insets.right - BUBBLE_SIZE - EDGE_MARGIN;
      const minY = insets.top + EDGE_MARGIN;
      const maxY = nextHeight - insets.bottom - BUBBLE_SIZE - EDGE_MARGIN;
      const initialX = maxX;
      const initialY = clamp(nextHeight * 0.62, minY, maxY);

      translateX.value = initialX;
      translateY.value = initialY;
      restX.value = initialX;
      restY.value = initialY;
      setRestPosition({ x: initialX, y: initialY });
      onRestPositionCommit?.({
        x: initialX + BUBBLE_SIZE / 2,
        y: initialY + BUBBLE_SIZE / 2,
      });
    },
    [
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      layoutH,
      layoutW,
      onRestPositionCommit,
      restX,
      restY,
      translateX,
      translateY,
    ],
  );

  useEffect(() => {
    if (interactive) return;
    setControlsOpen(false);
  }, [interactive]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(interactive)
        .onStart(() => {
          runOnJS(closeControls)();
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          const minX = insets.left + EDGE_MARGIN;
          const maxX = layoutW.value - insets.right - BUBBLE_SIZE - EDGE_MARGIN;
          const minY = insets.top + EDGE_MARGIN;
          const maxY =
            layoutH.value - insets.bottom - BUBBLE_SIZE - EDGE_MARGIN;
          const nextX = clamp(panStartX.value + event.translationX, minX, maxX);
          const nextY = clamp(panStartY.value + event.translationY, minY, maxY);

          translateX.value = withClamp(
            { min: minX, max: maxX },
            withSpring(nextX, DRAG_SPRING),
          );
          translateY.value = withClamp(
            { min: minY, max: maxY },
            withSpring(nextY, DRAG_SPRING),
          );
        })
        .onEnd((event) => {
          const minX = insets.left + EDGE_MARGIN;
          const maxX = layoutW.value - insets.right - BUBBLE_SIZE - EDGE_MARGIN;
          const minY = insets.top + EDGE_MARGIN;
          const maxY =
            layoutH.value - insets.bottom - BUBBLE_SIZE - EDGE_MARGIN;
          const x = clamp(panStartX.value + event.translationX, minX, maxX);
          const y = clamp(panStartY.value + event.translationY, minY, maxY);
          const vx = event.velocityX;
          const vy = event.velocityY;
          const strength = Math.hypot(vx, vy * VERTICAL_VELOCITY_WEIGHT);

          cancelAnimation(translateX);
          cancelAnimation(translateY);
          translateX.value = x;
          translateY.value = y;

          if (strength >= CORNER_THROW_STRENGTH) {
            const target = chooseCornerTarget(
              x,
              y,
              vx,
              vy,
              minX,
              maxX,
              minY,
              maxY,
            );
            translateX.value = withClamp(
              { min: minX, max: maxX },
              withSpring(
                target.x,
                { ...THROW_SETTLE_SPRING, velocity: vx },
                (finished) => {
                  "worklet";
                  if (finished) {
                    restX.value = target.x;
                    restY.value = target.y;
                    runOnJS(commitRestPosition)(target.x, target.y);
                  }
                },
              ),
            );
            translateY.value = withClamp(
              { min: minY, max: maxY },
              withSpring(target.y, { ...THROW_SETTLE_SPRING, velocity: vy }),
            );
            return;
          }

          translateX.value = withDecay(
            { velocity: vx, deceleration: 0.992, clamp: [minX, maxX] },
            (finished) => {
              "worklet";
              if (finished) {
                restX.value = translateX.value;
                runOnJS(commitRestPosition)(translateX.value, translateY.value);
              }
            },
          );
          translateY.value = withDecay(
            { velocity: vy, deceleration: 0.992, clamp: [minY, maxY] },
            (finished) => {
              "worklet";
              if (finished) {
                restY.value = translateY.value;
                // Re-commit with the final position: the vertical decay can
                // outlast the horizontal one, so the X callback may have
                // recorded a still-moving Y.
                runOnJS(commitRestPosition)(translateX.value, translateY.value);
              }
            },
          );
        }),
    [
      interactive,
      closeControls,
      commitRestPosition,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      layoutH,
      layoutW,
      panStartX,
      panStartY,
      restX,
      restY,
      translateX,
      translateY,
    ],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(interactive)
        .onEnd(() => {
          // Stop any in-flight settle and pin restPosition to where the bubble
          // actually is, so the controls anchor here instead of the pre-fling
          // spot and then snapping over once the decay finally commits.
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          restX.value = translateX.value;
          restY.value = translateY.value;
          runOnJS(commitRestPosition)(translateX.value, translateY.value);
          runOnJS(toggleControls)();
        }),
    [
      commitRestPosition,
      interactive,
      restX,
      restY,
      toggleControls,
      translateX,
      translateY,
    ],
  );

  const gesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const bubbleStyle = useAnimatedStyle(() => {
    const p = morphProgress ? morphProgress.value : 0;
    const baseX = translateX.value;
    const baseY = translateY.value;
    // As the panel opens, glide the bubble toward the panel's rest center while
    // it shrinks and fades — so it reads as turning into the panel.
    const targetX = layoutW.value / 2 - BUBBLE_SIZE / 2;
    const targetY = layoutH.value * 0.54 - BUBBLE_SIZE / 2;
    // Until the bubble is armed (panel first minimized) it stays fully hidden so
    // a fresh join opens straight into the panel with no bubble flash.
    const armedFactor = armed ? 1 : 0;
    return {
      opacity:
        interpolate(p, [0, 0.6], [1, 0], Extrapolation.CLAMP) * armedFactor,
      transform: [
        { translateX: baseX + (targetX - baseX) * p },
        { translateY: baseY + (targetY - baseY) * p },
        { scale: interpolate(p, [0, 1], [1, 0.4]) },
      ],
    };
  }, [armed, morphProgress]);

  const controlPlacement = useMemo<ControlPlacement | null>(() => {
    if (!restPosition) return null;
    const clusterWidth =
      CONTROL_COUNT * CONTROL_SIZE + (CONTROL_COUNT - 1) * CONTROL_GAP;
    const desiredLeft = restPosition.x + BUBBLE_SIZE / 2 - clusterWidth / 2;
    const left = clamp(
      desiredLeft,
      insets.left + EDGE_MARGIN,
      width - insets.right - EDGE_MARGIN - clusterWidth,
    );
    const spaceAbove = restPosition.y - insets.top;
    const spaceBelow = height - insets.bottom - (restPosition.y + BUBBLE_SIZE);
    const above =
      spaceBelow < CONTROL_SIZE + CONTROL_CLUSTER_GAP &&
      spaceAbove > spaceBelow;
    const top = above
      ? restPosition.y - CONTROL_CLUSTER_GAP - CONTROL_SIZE
      : restPosition.y + BUBBLE_SIZE + CONTROL_CLUSTER_GAP;
    return {
      above,
      nearRightEdge: restPosition.x + BUBBLE_SIZE / 2 > width / 2,
      left,
      top: clamp(
        top,
        insets.top + EDGE_MARGIN,
        height - insets.bottom - EDGE_MARGIN - CONTROL_SIZE,
      ),
    };
  }, [
    height,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    restPosition,
    width,
  ]);

  useEffect(() => {
    if (controlsOpen && controlPlacement) {
      setControlsMounted(true);
      controlsProgress.value = withTiming(1, { duration: 150 });
      return;
    }

    controlsProgress.value = withTiming(0, { duration: 120 }, (finished) => {
      "worklet";
      if (finished) {
        runOnJS(setControlsMounted)(false);
      }
    });
  }, [controlPlacement, controlsOpen, controlsProgress]);

  const controlAnchor = useMemo(() => {
    if (!controlPlacement || !restPosition) return { x: 0, y: 0 };
    return {
      x: restPosition.x + BUBBLE_SIZE / 2 - controlPlacement.left,
      y: restPosition.y + BUBBLE_SIZE / 2 - controlPlacement.top,
    };
  }, [controlPlacement, restPosition]);

  const controlsRevealStyle = useAnimatedStyle(() => {
    const progress = controlsProgress.value;
    const scale = 0.92 + progress * 0.08;
    return {
      opacity: progress,
      transform: [
        { translateX: controlAnchor.x },
        { translateY: controlAnchor.y },
        { scale },
        { translateX: -controlAnchor.x },
        { translateY: -controlAnchor.y },
      ],
    };
  }, [controlAnchor.x, controlAnchor.y]);

  if (!active) return null;

  const bubbleIcon: ThemedIoniconsProps["name"] = state.joining
    ? "radio-outline"
    : state.isDeafened
      ? "volume-mute-outline"
      : state.isMuted
        ? "mic-off-outline"
        : "volume-high-outline";

  const controls = [
    <QuickControl
      key="mute"
      label={state.isMuted ? "Unmute" : "Mute"}
      icon={state.isMuted ? "mic-off-outline" : "mic-outline"}
      active={state.isMuted}
      disabled={state.joining}
      onPress={actions.toggleMute}
    />,
    <QuickControl
      key="deafen"
      label={state.isDeafened ? "Undeafen" : "Deafen"}
      icon={state.isDeafened ? "volume-mute-outline" : "volume-high-outline"}
      active={state.isDeafened}
      disabled={state.joining}
      onPress={actions.toggleDeafen}
    />,
    <QuickControl
      key="leave"
      label="Leave voice"
      icon="call-outline"
      destructive
      onPress={() => {
        setControlsOpen(false);
        onLeave();
      }}
    />,
    <QuickControl
      key="open"
      label="Open voice panel"
      icon={
        controlPlacement?.nearRightEdge ? "chevron-back" : "chevron-forward"
      }
      onPress={() => {
        setControlsOpen(false);
        onOpenFullSheet();
      }}
    />,
  ];

  const orderedControls = controlPlacement?.nearRightEdge
    ? [controls[3], controls[0], controls[1], controls[2]]
    : controls;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-0"
      onLayout={handleLayout}
    >
      {controlsMounted && controlPlacement ? (
        <Animated.View
          pointerEvents={controlsOpen ? "box-none" : "none"}
          className="absolute"
          style={[
            { left: controlPlacement.left, top: controlPlacement.top },
            controlsRevealStyle,
          ]}
        >
          <View className="flex-row gap-2 rounded-3xl border border-border-panel bg-surface-modal/95 p-1.5 shadow-lg">
            {orderedControls}
          </View>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={gesture}>
        <Animated.View
          pointerEvents={interactive ? "auto" : "none"}
          entering={armed ? FadeIn.duration(160) : undefined}
          exiting={armed ? FadeOut.duration(120) : undefined}
          style={[
            { position: "absolute", height: BUBBLE_SIZE, width: BUBBLE_SIZE },
            bubbleStyle,
          ]}
        >
          <View className="h-full w-full items-center justify-center rounded-full border border-border-panel bg-primary shadow-lg">
            {state.joining ? (
              <ActivityIndicator color={spinnerColor} size="small" />
            ) : (
              <ThemedIonicons
                name={bubbleIcon}
                size={26}
                colorClassName="accent-primary-foreground"
              />
            )}
            {participantCount > 0 ? (
              <View className="absolute -right-1 -top-1 min-w-6 rounded-full border border-border-panel bg-surface-modal px-1.5 py-0.5">
                <Text className="text-center text-[11px] font-bold text-foreground">
                  {participantCount > 99 ? "99+" : participantCount}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
