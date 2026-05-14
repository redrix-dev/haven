import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withClamp,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

const BUBBLE_SIZE = 64;
const EDGE_MARGIN = 12;
const SHEET_HEIGHT = 400;

// Drag: spring toward finger each frame — slight lag + tiny settle wobble when
// motion stops (lower damping / no overshoot clamp). Touch target = visible 64×64.
const DRAG_SPRING = {
  stiffness: 368,
  damping: 18,
  mass: 1.0,
  overshootClamping: false,
} as const;

// Throw release: both axes spring toward the same clamped predicted point
// (positional vector prediction — no separate horizontal rail phase).
const THROW_SETTLE_SPRING = {
  stiffness: 52,
  damping: 20,
  mass: 1.15,
  overshootClamping: false,
} as const;

// Seconds-scale factor: predicted landing = position + velocity * factor (then clamped).
const THROW_PROJECTION_S = 0.14;

// Below: decay on both axes (place / gentle release).
const FLING_STRENGTH_FOR_THROW_SETTLE = 420;
// At and above: commit to a top corner (ray first-hit); below but above
// FLING_STRENGTH_FOR_THROW_SETTLE: spring to clamped prediction only (no forced corner).
const FLING_STRENGTH_FOR_TOP_CORNER_COMMIT = 580;
const VERTICAL_VELOCITY_WEIGHT_FOR_FLING_STRENGTH = 0.35;

// Snap spring used for expand (bubble moving to top-right)
// Slightly snappier than edge snap
const EXPAND_SPRING = { damping: 20, stiffness: 160, mass: 1.0 } as const;

// Snap spring used for collapse (bubble returning to rest)
const COLLAPSE_SPRING = { damping: 22, stiffness: 130, mass: 1.1 } as const;

const EXPAND_SHEET_DELAY_MS = 350;

/**
 * First wall hit by ray (x0,y0) + t*(vx,vy), t>0, inside the bubble bounds
 * rectangle; maps to top-left or top-right corner (y = minY only, never top-center).
 */
function topCornerTargetFromRay(
  x0: number,
  y0: number,
  vx: number,
  vy: number,
  leftSnap: number,
  rightSnap: number,
  minY: number,
  maxY: number,
): { x: number; y: number } {
  "worklet";
  const midX = (leftSnap + rightSnap) * 0.5;
  const cornerY = minY;
  const EPS = 1e-3;

  let bestT = Number.POSITIVE_INFINITY;
  let hit = -1; // 0 top, 1 left, 2 right, 3 bottom

  const tryHit = (t: number, kind: number) => {
    if (t <= EPS || t >= bestT) return;
    bestT = t;
    hit = kind;
  };

  if (Math.abs(vy) > EPS) {
    const t = (minY - y0) / vy;
    const xh = x0 + vx * t;
    if (xh >= leftSnap && xh <= rightSnap) tryHit(t, 0);
  }
  if (Math.abs(vx) > EPS) {
    const tL = (leftSnap - x0) / vx;
    const yL = y0 + vy * tL;
    if (yL >= minY && yL <= maxY) tryHit(tL, 1);
    const tR = (rightSnap - x0) / vx;
    const yR = y0 + vy * tR;
    if (yR >= minY && yR <= maxY) tryHit(tR, 2);
  }
  if (Math.abs(vy) > EPS) {
    const t = (maxY - y0) / vy;
    const xh = x0 + vx * t;
    if (xh >= leftSnap && xh <= rightSnap) tryHit(t, 3);
  }

  if (hit === 0) {
    const xh = Math.min(
      rightSnap,
      Math.max(leftSnap, x0 + vx * bestT),
    );
    return { x: xh <= midX ? leftSnap : rightSnap, y: cornerY };
  }
  if (hit === 1) {
    return { x: leftSnap, y: cornerY };
  }
  if (hit === 2) {
    return { x: rightSnap, y: cornerY };
  }
  if (hit === 3) {
    const xh = Math.min(
      rightSnap,
      Math.max(leftSnap, x0 + vx * bestT),
    );
    return { x: xh <= midX ? leftSnap : rightSnap, y: cornerY };
  }

  return { x: vx >= 0 ? rightSnap : leftSnap, y: cornerY };
}

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
  const panAnchorX = useSharedValue(0);
  const panAnchorY = useSharedValue(0);

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
    const h = layoutH.value;
    const minX = insetLeft.value + EDGE_MARGIN;
    const maxX = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
    const minY = EDGE_MARGIN;
    const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;
    const targetX = maxX;
    const targetY = minY;
    sheetOpacity.value = 0;
    translateX.value = withClamp(
      { min: minX, max: maxX },
      withSpring(targetX, EXPAND_SPRING),
    );
    translateY.value = withClamp(
      { min: minY, max: maxY },
      withSpring(targetY, EXPAND_SPRING),
    );
    expandSheetTimeoutRef.current = setTimeout(() => {
      sheetOpacity.value = withTiming(1, { duration: 220 });
      expandSheetTimeoutRef.current = null;
    }, EXPAND_SHEET_DELAY_MS);
  }, [clearExpandTimer, insetBottom, insetLeft, insetRight, layoutH, layoutW, sheetOpacity, translateX, translateY]);

  const finishCollapse = useCallback(() => {
    const w = layoutW.value;
    const h = layoutH.value;
    const minX = insetLeft.value + EDGE_MARGIN;
    const maxX = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
    const minY = EDGE_MARGIN;
    const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;
    translateX.value = withClamp(
      { min: minX, max: maxX },
      withSpring(restX.value, COLLAPSE_SPRING, (finished) => {
        "worklet";
        if (finished) {
          scheduleOnRN(setExpandedFalse);
        }
      }),
    );
    translateY.value = withClamp(
      { min: minY, max: maxY },
      withSpring(restY.value, COLLAPSE_SPRING),
    );
  }, [insetBottom, insetLeft, insetRight, layoutH, layoutW, setExpandedFalse, translateX, translateY, restX, restY]);

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
          panAnchorX.value = translateX.value;
          panAnchorY.value = translateY.value;
        })
        .onUpdate((e) => {
          const w = layoutW.value;
          const h = layoutH.value;
          const maxX = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
          const minX = insetLeft.value + EDGE_MARGIN;
          const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;
          const minY = EDGE_MARGIN;
          const targetX = Math.min(
            maxX,
            Math.max(minX, panAnchorX.value + e.translationX),
          );
          const targetY = Math.min(
            maxY,
            Math.max(minY, panAnchorY.value + e.translationY),
          );
          translateX.value = withClamp(
            { min: minX, max: maxX },
            withSpring(targetX, DRAG_SPRING),
          );
          translateY.value = withClamp(
            { min: minY, max: maxY },
            withSpring(targetY, DRAG_SPRING),
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
          const softEnergeticThrow =
            flingStrength >= FLING_STRENGTH_FOR_THROW_SETTLE &&
            flingStrength < FLING_STRENGTH_FOR_TOP_CORNER_COMMIT;
          const hardCornerThrow =
            flingStrength >= FLING_STRENGTH_FOR_TOP_CORNER_COMMIT;

          if (hardCornerThrow) {
            const corner = topCornerTargetFromRay(
              translateX.value,
              translateY.value,
              vx,
              vy,
              leftSnap,
              rightSnap,
              minY,
              maxY,
            );
            translateX.value = withClamp(
              { min: leftSnap, max: rightSnap },
              withSpring(
                corner.x,
                { ...THROW_SETTLE_SPRING, velocity: vx },
                (finished) => {
                  "worklet";
                  if (finished) {
                    restX.value = corner.x;
                    restY.value = corner.y;
                    scheduleOnRN(commitRestPosition, corner.x, corner.y);
                  }
                },
              ),
            );
            translateY.value = withClamp(
              { min: minY, max: maxY },
              withSpring(corner.y, {
                ...THROW_SETTLE_SPRING,
                velocity: vy,
              }),
            );
          } else if (softEnergeticThrow) {
            const rawPredX = translateX.value + vx * THROW_PROJECTION_S;
            const rawPredY = translateY.value + vy * THROW_PROJECTION_S;
            const predX = Math.min(
              rightSnap,
              Math.max(leftSnap, rawPredX),
            );
            const predY = Math.min(maxY, Math.max(minY, rawPredY));
            translateX.value = withClamp(
              { min: leftSnap, max: rightSnap },
              withSpring(
                predX,
                { ...THROW_SETTLE_SPRING, velocity: vx },
                (finished) => {
                  "worklet";
                  if (finished) {
                    restX.value = predX;
                    restY.value = predY;
                    scheduleOnRN(commitRestPosition, predX, predY);
                  }
                },
              ),
            );
            translateY.value = withClamp(
              { min: minY, max: maxY },
              withSpring(predY, {
                ...THROW_SETTLE_SPRING,
                velocity: vy,
              }),
            );
          } else {
            translateX.value = withDecay(
              {
                velocity: vx,
                deceleration: 0.992,
                clamp: [leftSnap, rightSnap],
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

            translateY.value = withDecay(
              {
                velocity: vy,
                deceleration: 0.992,
                clamp: [minY, maxY],
              },
              (finished) => {
                "worklet";
                if (finished) {
                  restY.value = translateY.value;
                }
              },
            );
          }
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
