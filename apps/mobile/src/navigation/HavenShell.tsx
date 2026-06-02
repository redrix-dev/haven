import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { BackHandler, Dimensions, Keyboard, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const CHANNEL_DRAWER_WIDTH = Math.min(320, Dimensions.get("window").width * 0.86);
const RAIL_WIDTH = 72;
export const DRAWER_SURFACE_WIDTH = RAIL_WIDTH + CHANNEL_DRAWER_WIDTH;
const DRAWER_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };
const EDGE_WIDTH = 28;

export type HavenShellHandle = {
  setDrawerOpen: (open: boolean) => void;
};

type HavenShellProps = {
  rail: React.ReactNode;
  drawerContent: React.ReactNode;
  chatContent: React.ReactNode;
  topBar: React.ReactNode;
  /**
   * Gates all gesture handlers and the close guard. Pass `true` once the
   * shell has meaningful content (e.g. a server or DM conversation loaded).
   * When `false`, the drawer cannot be closed by gesture or back-press.
   */
  hasContent: boolean;
  openDrawerOnMount?: boolean;
  onDrawerStateChange?: (open: boolean) => void;
};

export const HavenShell = forwardRef<HavenShellHandle, HavenShellProps>(
  function HavenShell(
    {
      rail,
      drawerContent,
      chatContent,
      topBar,
      hasContent,
      openDrawerOnMount = false,
      onDrawerStateChange,
    },
    ref,
  ) {
    const [drawerOpen, setDrawerOpen] = useState(openDrawerOnMount);
    const drawerOffset = useSharedValue(openDrawerOnMount ? 0 : -DRAWER_SURFACE_WIDTH);
    const dragStartOffset = useSharedValue(0);

    const setDrawerOpenAnimated = useCallback(
      (open: boolean) => {
        // Guard: don't allow closing when there is no content to reveal
        if (!hasContent && !open) return;
        Keyboard.dismiss();
        setDrawerOpen(open);
        onDrawerStateChange?.(open);
        drawerOffset.value = withTiming(open ? 0 : -DRAWER_SURFACE_WIDTH, DRAWER_TIMING);
      },
      [drawerOffset, hasContent, onDrawerStateChange],
    );

    useImperativeHandle(
      ref,
      () => ({ setDrawerOpen: setDrawerOpenAnimated }),
      [setDrawerOpenAnimated],
    );

    // Hardware back: close drawer first, then let the navigator handle the press
    useEffect(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (drawerOpen) {
          if (hasContent) setDrawerOpenAnimated(false);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [drawerOpen, hasContent, setDrawerOpenAnimated]);

    // ── Gestures ────────────────────────────────────────────────────────────

    /** Swipe left/right anywhere on the main surface (when drawer is closed). */
    const panGesture = Gesture.Pan()
      .enabled(hasContent)
      .activeOffsetX([-18, 18])
      .failOffsetY([-12, 12])
      .onStart(() => {
        dragStartOffset.value = drawerOffset.value;
      })
      .onUpdate((event) => {
        const next = dragStartOffset.value + event.translationX;
        drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
      })
      .onEnd((event) => {
        const projected = drawerOffset.value + event.velocityX * 0.12;
        const shouldOpen = projected > -DRAWER_SURFACE_WIDTH / 2;
        runOnJS(setDrawerOpenAnimated)(shouldOpen);
      });

    /** Right-swipe from the 28 px left edge (when drawer is closed). */
    const edgeOpenGesture = Gesture.Pan()
      .enabled(hasContent)
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onStart(() => {
        dragStartOffset.value = drawerOffset.value;
      })
      .onUpdate((event) => {
        if (event.translationX <= 0) return;
        const next = dragStartOffset.value + event.translationX;
        drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
      })
      .onEnd((event) => {
        const projected = drawerOffset.value + event.velocityX * 0.12;
        const shouldOpen = projected > -DRAWER_SURFACE_WIDTH / 2;
        runOnJS(setDrawerOpenAnimated)(shouldOpen);
      });

    /** Left-swipe anywhere on the open drawer panel. */
    const drawerCloseGesture = Gesture.Pan()
      .enabled(hasContent && drawerOpen)
      .activeOffsetX([-18, 18])
      .failOffsetY([-12, 12])
      .onStart(() => {
        dragStartOffset.value = drawerOffset.value;
      })
      .onUpdate((event) => {
        if (event.translationX > 0) return;
        const next = dragStartOffset.value + event.translationX;
        drawerOffset.value = Math.min(0, Math.max(-DRAWER_SURFACE_WIDTH, next));
      })
      .onEnd((event) => {
        const projected = drawerOffset.value + event.velocityX * 0.12;
        const shouldOpen = event.velocityX > -350 && projected > -DRAWER_SURFACE_WIDTH / 2;
        runOnJS(setDrawerOpenAnimated)(shouldOpen);
      });

    // ── Animated styles ─────────────────────────────────────────────────────

    const drawerStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: drawerOffset.value }],
    }));

    const scrimStyle = useAnimatedStyle(() => {
      const progress = Math.max(0, Math.min(1, 1 + drawerOffset.value / DRAWER_SURFACE_WIDTH));
      return { opacity: progress * 0.45 };
    });

    const mainShiftStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: drawerOffset.value + DRAWER_SURFACE_WIDTH }],
    }));

    // ── Render ───────────────────────────────────────────────────────────────

    return (
      <View className="flex-1 bg-background">
        <View className="flex-1 overflow-hidden">
          {/* ── Drawer panel (rail + drawer content) ── */}
          <GestureDetector gesture={drawerCloseGesture}>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: DRAWER_SURFACE_WIDTH,
                  zIndex: 2,
                  flexDirection: "row",
                },
                drawerStyle,
              ]}
            >
              {rail}
              <View style={{ flex: 1 }}>{drawerContent}</View>
            </Animated.View>
          </GestureDetector>

          {/* ── Main surface (top bar + chat content + scrim) ── */}
          <GestureDetector gesture={panGesture}>
            <Animated.View className="flex-1" style={mainShiftStyle}>
              {topBar}
              {chatContent}

              {/* Scrim overlay — darkens chat surface while drawer is open */}
              <Animated.View
                pointerEvents={drawerOpen ? "auto" : "none"}
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 1)",
                  },
                  scrimStyle,
                ]}
              >
                <Pressable
                  className="flex-1"
                  onPress={() => setDrawerOpenAnimated(false)}
                />
              </Animated.View>
            </Animated.View>
          </GestureDetector>

          {/* ── 28 px left-edge hit zone — opens drawer via right-swipe ── */}
          {!drawerOpen && hasContent ? (
            <GestureDetector gesture={edgeOpenGesture}>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: EDGE_WIDTH,
                  zIndex: 3,
                }}
              />
            </GestureDetector>
          ) : null}
        </View>
      </View>
    );
  },
);
