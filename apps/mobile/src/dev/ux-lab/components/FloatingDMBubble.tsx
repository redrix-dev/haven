import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

const BUBBLE_SIZE = 56;
const EDGE_MARGIN = 12;
const SHEET_HEIGHT = 400;

// How closely the bubble tracks your thumb during drag
// Higher mass = more perceived lag behind finger
// const DRAG_SPRING = { damping: 28, stiffness: 380, mass: 1.4 } as const;

// Horizontal flick: one spring to a rail with release velocity baked in.
const FLING_X_SPRING = {
  stiffness: 48,
  damping: 19,
  mass: 1.2,
  overshootClamping: true,
} as const;

// “Projection”: where this release would land along X if we extended current
// motion by a tunable time slice (emotionally tuned, not full decay integration).
// Used only to pick left vs right rail for strong flings (avoids pure sign(vx)
// when you’re near the opposite rail).
const HORIZONTAL_FLING_PROJECTION_S = 0.14;

// |flingStrength| below this uses decay only in X (no edge spring). flingStrength
// combines horizontal and (weighted) vertical release velocity so a sharp vertical
// flick still “counts” as energetic.
const FLING_STRENGTH_FOR_EDGE_SPRING = 420;
const VERTICAL_VELOCITY_WEIGHT_FOR_FLING_STRENGTH = 0.35;

/** Stage 3: asymptotic resistance past hard rails (drag + decay rubber-band). */
const RUBBER_BAND_DRAG_RESISTANCE = 0.55;
const RUBBER_BAND_DECAY_FACTOR = 0.55;

function rubberBandToRange(
  value: number,
  min: number,
  max: number,
  rangeSize: number,
): number {
  "worklet";
  const dim = Math.max(1, rangeSize);
  const c = RUBBER_BAND_DRAG_RESISTANCE;
  if (value >= min && value <= max) {
    return value;
  }
  if (value > max) {
    const over = value - max;
    return max + (over * c * dim) / (dim + over);
  }
  const under = min - value;
  return min - (under * c * dim) / (dim + under);
}

/** Stage 1: projected landing along X (unclamped), px. */
function rawProjectedTranslateX(currentX: number, vx: number): number {
  "worklet";
  return currentX + vx * HORIZONTAL_FLING_PROJECTION_S;
}

/** Stage 1: pick rail from projected rest vs rail midpoint (trajectory-based). */
function snapXFromHorizontalProjection(
  rawProjectedX: number,
  leftSnap: number,
  rightSnap: number,
): number {
  "worklet";
  const midRail = (leftSnap + rightSnap) * 0.5;
  return rawProjectedX >= midRail ? rightSnap : leftSnap;
}

// Snap spring used for expand (bubble moving to top-right)
// Slightly snappier than edge snap
const EXPAND_SPRING = { damping: 20, stiffness: 160, mass: 1.0 } as const;

// Snap spring used for collapse (bubble returning to rest)
const COLLAPSE_SPRING = { damping: 22, stiffness: 130, mass: 1.1 } as const;

const EXPAND_SHEET_DELAY_MS = 350;

export type FloatingDMBubbleProps = Record<string, never>;

export function FloatingDMBubble(_props: FloatingDMBubbleProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const layoutW = useSharedValue(width);
  const layoutH = useSharedValue(0);
  const insetLeft = useSharedValue(insets.left);
  const insetRight = useSharedValue(insets.right);
  const insetBottom = useSharedValue(insets.bottom);

  useEffect(() => {
    insetLeft.value = insets.left;
    insetRight.value = insets.right;
    insetBottom.value = insets.bottom;
  }, [insetBottom, insetLeft, insetRight, insets.bottom, insets.left, insets.right]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panPrevTranslationX = useSharedValue(0);
  const panPrevTranslationY = useSharedValue(0);

  const restX = useSharedValue(0);
  const restY = useSharedValue(0);

  const sheetOpacity = useSharedValue(0);

  const [, setRestPosition] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const commitRestPosition = useCallback((x: number, y: number) => {
    setRestPosition({ x, y });
  }, []);
  const setExpandedFalse = useCallback(() => {
    setExpanded(false);
  }, []);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const expandSheetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layoutInitialized = useRef(false);

  const handleOverlayLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const w = event.nativeEvent.layout.width;
      const h = event.nativeEvent.layout.height;
      layoutW.value = w;
      layoutH.value = h;
      if (layoutInitialized.current || w <= 0 || h <= 0) return;
      layoutInitialized.current = true;
      const rx = w - insets.right - BUBBLE_SIZE - EDGE_MARGIN;
      const ry = (h - BUBBLE_SIZE) / 2;
      translateX.value = rx;
      translateY.value = ry;
      restX.value = rx;
      restY.value = ry;
      setRestPosition({ x: rx, y: ry });
    },
    [insets.right, layoutH, layoutW, restX, restY, translateX, translateY],
  );

  const clearExpandTimer = useCallback(() => {
    if (expandSheetTimeoutRef.current != null) {
      clearTimeout(expandSheetTimeoutRef.current);
      expandSheetTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearExpandTimer(), [clearExpandTimer]);

  const beginExpand = useCallback(() => {
    clearExpandTimer();
    setExpanded(true);
    const w = layoutW.value;
    const targetX = w - insets.right - BUBBLE_SIZE - EDGE_MARGIN;
    const targetY = EDGE_MARGIN;
    sheetOpacity.value = 0;
    translateX.value = withSpring(targetX, EXPAND_SPRING);
    translateY.value = withSpring(targetY, EXPAND_SPRING);
    expandSheetTimeoutRef.current = setTimeout(() => {
      sheetOpacity.value = withTiming(1, { duration: 220 });
      expandSheetTimeoutRef.current = null;
    }, EXPAND_SHEET_DELAY_MS);
  }, [clearExpandTimer, insets.right, sheetOpacity, translateX, translateY]);

  const finishCollapse = useCallback(() => {
    translateX.value = withSpring(restX.value, COLLAPSE_SPRING, (finished) => {
      "worklet";
      if (finished) {
        scheduleOnRN(setExpandedFalse);
      }
    });
    translateY.value = withSpring(restY.value, COLLAPSE_SPRING);
  }, [setExpandedFalse, translateX, translateY, restX, restY]);

  const beginCollapse = useCallback(() => {
    clearExpandTimer();
    sheetOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      "worklet";
      if (finished) {
        scheduleOnRN(finishCollapse);
      }
    });
  }, [clearExpandTimer, finishCollapse, sheetOpacity]);

  const handleBubbleTap = useCallback(() => {
    if (expandedRef.current) {
      beginCollapse();
    } else {
      beginExpand();
    }
  }, [beginCollapse, beginExpand]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!expanded)
        .onStart(() => {
          panPrevTranslationX.value = 0;
          panPrevTranslationY.value = 0;
        })
        .onUpdate((e) => {
          const dx = e.translationX - panPrevTranslationX.value;
          const dy = e.translationY - panPrevTranslationY.value;
          panPrevTranslationX.value = e.translationX;
          panPrevTranslationY.value = e.translationY;
          const w = layoutW.value;
          const h = layoutH.value;
          const maxX = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
          const minX = insetLeft.value + EDGE_MARGIN;
          const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;
          const minY = EDGE_MARGIN;
          const rangeX = maxX - minX;
          const rangeY = maxY - minY;
          translateX.value = rubberBandToRange(
            translateX.value + dx,
            minX,
            maxX,
            rangeX,
          );
          translateY.value = rubberBandToRange(
            translateY.value + dy,
            minY,
            maxY,
            rangeY,
          );
        })
        .onEnd((e) => {
          const w = layoutW.value;
          const h = layoutH.value;
          const leftSnap = insetLeft.value + EDGE_MARGIN;
          const rightSnap = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
          const minY = EDGE_MARGIN;
          const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;

          const vx = e.velocityX;
          const vy = e.velocityY;
          const flingStrength = Math.hypot(
            vx,
            vy * VERTICAL_VELOCITY_WEIGHT_FOR_FLING_STRENGTH,
          );
          const strongHorizontalFling =
            flingStrength >= FLING_STRENGTH_FOR_EDGE_SPRING;

          if (strongHorizontalFling) {
            const rawProjX = rawProjectedTranslateX(translateX.value, vx);
            const snapX = snapXFromHorizontalProjection(
              rawProjX,
              leftSnap,
              rightSnap,
            );
            translateX.value = withSpring(
              snapX,
              { ...FLING_X_SPRING, velocity: vx },
              (finished) => {
                "worklet";
                if (finished) {
                  restX.value = snapX;
                  scheduleOnRN(commitRestPosition, snapX, translateY.value);
                }
              },
            );
          } else {
            translateX.value = withDecay(
              {
                velocity: vx,
                deceleration: 0.992,
                clamp: [leftSnap, rightSnap],
                rubberBandEffect: true,
                rubberBandFactor: RUBBER_BAND_DECAY_FACTOR,
              },
              (finished) => {
                "worklet";
                if (finished) {
                  const finalX = translateX.value;
                  restX.value = finalX;
                  scheduleOnRN(commitRestPosition, finalX, translateY.value);
                }
              },
            );
          }

          translateY.value = withDecay(
            {
              velocity: e.velocityY,
              deceleration: 0.992,
              clamp: [minY, maxY],
              rubberBandEffect: true,
              rubberBandFactor: RUBBER_BAND_DECAY_FACTOR,
            },
            (finished) => {
              "worklet";
              if (finished) {
                restY.value = translateY.value;
              }
            },
          );
        }),
    [commitRestPosition, expanded],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        scheduleOnRN(handleBubbleTap);
      }),
    [handleBubbleTap],
  );

  const bubbleGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
  }));

  const sheetWidth = Math.min(360, Math.max(200, width - EDGE_MARGIN * 2));

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      onLayout={handleOverlayLayout}
    >
      {expanded ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheet,
            {
              top: BUBBLE_SIZE + EDGE_MARGIN * 2,
              right: EDGE_MARGIN,
              width: sheetWidth,
              height: SHEET_HEIGHT,
            },
            sheetStyle,
          ]}
        />
      ) : null}
      <GestureDetector gesture={bubbleGesture}>
        <Animated.View
          accessibilityLabel="UX Lab direct messages bubble"
          accessibilityRole="button"
          style={[styles.bubble, bubbleStyle]}
        />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: "#6366f1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  sheet: {
    position: "absolute",
    borderRadius: 16,
    backgroundColor: "#1d4ed8",
  },
});
