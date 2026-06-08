/**
 * LOCKED: DMFloatingBubble — do not modify behavior without explicit product approval.
 * Extracted from haven-rev2 DMBubbleHost; ux-lab reference: dev/ux-lab/components/FloatingDMBubble.tsx
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withClamp,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { DirectMessagesContainer } from "@/features/direct-messages/DirectMessagesContainer";
import { MobileModmailPanel } from "@/features/moderation/MobileModmailPanel";
import { cornerTargetFromRay } from "@/features/direct-messages/utils/cornerTargetFromRay";
import { useDmBubbleShellStore } from "@/features/direct-messages/stores/dmBubbleShellStore";
import type {
  FloatingDmBubbleIconName,
  FloatingDMBubbleProps,
  FloatingDmChannelConfig,
  FloatingDmChannelId,
} from "@/theme-rn/floatingDmTypes";
import { ThemedIonicons } from "@/theme-rn";
import { useFloatingDmPlaceholderChannels } from "@/theme-rn/useFloatingDmPlaceholderChannels";
import { useDmBubbleSheetChrome } from "@/theme-rn/useDmBubbleSheetChrome";
import { useHavenCore } from "@shared/core";
import { useCommunities } from "@react-bindings";

export type {
  FloatingDmBubbleIconName,
  FloatingDMBubbleProps,
  FloatingDmChannelConfig,
  FloatingDmChannelId,
} from "@/theme-rn/floatingDmTypes";

const BUBBLE_SIZE = 64;
const EDGE_MARGIN = 12;

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
// At and above: commit to a screen corner (ray first-hit); below but above
// FLING_STRENGTH_FOR_THROW_SETTLE: spring to clamped prediction only (no forced corner).
const FLING_STRENGTH_FOR_CORNER_COMMIT = 580;
const VERTICAL_VELOCITY_WEIGHT_FOR_FLING_STRENGTH = 0.35;

// Snap spring used for expand (bubble moving to top-right)
// Slightly snappier than edge snap
const EXPAND_SPRING = { damping: 20, stiffness: 160, mass: 1.0 } as const;

// Snap spring used for collapse (bubble returning to rest)
const COLLAPSE_SPRING = { damping: 22, stiffness: 130, mass: 1.1 } as const;

const EXPAND_SHEET_DELAY_MS = 350;
const BUBBLE_GAP = 10;
const MORPH_MS = 220;

// ---------------------------------------------------------------------------
// Public props (package-ready). Parent can pass real channels + handlers later;
// UX lab uses PLACEHOLDER_CHANNELS when `channels` is omitted.
// Inferred from: MainNavigationShell DM sheet (visible, onDismiss, title, body)
// plus DirectMessageNexus state (conversations, selection).
// ---------------------------------------------------------------------------

function resolveChannels(
  input: FloatingDmChannelConfig[] | undefined,
  themedDefaults: FloatingDmChannelConfig[],
): FloatingDmChannelConfig[] {
  return input && input.length > 0 ? input : themedDefaults;
}

function resolveDefaultChannelId(
  channels: FloatingDmChannelConfig[],
  requested?: FloatingDmChannelId,
): FloatingDmChannelId {
  if (requested && channels.some((c) => c.id === requested)) return requested;
  return channels[0]!.id;
}

function resolveBubbleFace(channel: FloatingDmChannelConfig): {
  name: FloatingDmBubbleIconName;
  colorClassName: `accent-${string}`;
} {
  return {
    name: channel.bubbleIconName ?? (channel.id === "modmail" ? "shield-outline" : "mail-outline"),
    colorClassName:
      channel.bubbleIconColorClassName ??
      (channel.id === "modmail" ? "accent-background" : "accent-primary-foreground"),
  };
}

function BubbleFaceIcon({ channel }: { channel: FloatingDmChannelConfig }) {
  const { name, colorClassName } = resolveBubbleFace(channel);
  return (
    <View style={styles.bubbleInner} pointerEvents="none">
      <ThemedIonicons name={name} size={30} colorClassName={colorClassName} />
    </View>
  );
}

export function DMFloatingBubble(props: FloatingDMBubbleProps = {}) {
  const {
    channels: channelsProp,
    defaultChannelId: defaultChannelIdProp,
    onOpenChange,
    onChannelChange,
    onRestPositionCommit,
  } = props;

  const themedDefaults = useFloatingDmPlaceholderChannels();
  const sheetChrome = useDmBubbleSheetChrome();
  const core = useHavenCore();
  const communities = useCommunities(core.communities);
  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();
  const modmailManagedCommunityIds = useMemo(
    () =>
      communities
        .filter(
          (community) =>
            permissionsByCommunityId[community.id]?.canManageReports,
        )
        .map((community) => community.id),
    [communities, permissionsByCommunityId],
  );

  const channels = useMemo(
    () => resolveChannels(channelsProp, themedDefaults),
    [channelsProp, themedDefaults],
  );
  const initialChannelId = useMemo(
    () => resolveDefaultChannelId(channels, defaultChannelIdProp),
    [channels, defaultChannelIdProp],
  );

  const [activeChannelId, setActiveChannelId] =
    useState<FloatingDmChannelId>(initialChannelId);
  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? channels[0]!,
    [activeChannelId, channels],
  );

  const primaryChannel = channels[0]!;
  const secondaryChannel = channels.length > 1 ? channels[1]! : null;

  useEffect(() => {
    setActiveChannelId((prev) =>
      channels.some((c) => c.id === prev) ? prev : initialChannelId,
    );
  }, [channels, initialChannelId]);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const layoutW = useSharedValue(width);
  const layoutH = useSharedValue(0);
  const insetLeft = useSharedValue(insets.left);
  const insetRight = useSharedValue(insets.right);
  const insetTop = useSharedValue(insets.top);
  const insetBottom = useSharedValue(insets.bottom);

  useEffect(() => {
    insetLeft.value = insets.left;
    insetRight.value = insets.right;
    insetTop.value = insets.top;
    insetBottom.value = insets.bottom;
  }, [insetBottom, insetLeft, insetRight, insetTop, insets.bottom, insets.left, insets.right, insets.top]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panAnchorX = useSharedValue(0);
  const panAnchorY = useSharedValue(0);

  const restX = useSharedValue(0);
  const restY = useSharedValue(0);

  const sheetOpacity = useSharedValue(0);
  const secondaryDeltaX = useSharedValue(0);
  const secondaryOpacity = useSharedValue(0);

  const [, setRestPosition] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const commitRestPosition = useCallback(
    (x: number, y: number) => {
      setRestPosition({ x, y });
      onRestPositionCommit?.({ x, y });
    },
    [onRestPositionCommit],
  );
  const setExpandedFalse = useCallback(() => {
    setExpanded(false);
  }, []);

  useEffect(() => {
    onOpenChange?.(expanded);
  }, [expanded, onOpenChange]);

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
      const minY = insets.top + EDGE_MARGIN;
      const maxY = h - insets.bottom - BUBBLE_SIZE - EDGE_MARGIN;
      const ry = Math.min(maxY, Math.max(minY, (h - BUBBLE_SIZE) / 2));
      translateX.value = rx;
      translateY.value = ry;
      restX.value = rx;
      restY.value = ry;
      setRestPosition({ x: rx, y: ry });
    },
    [insets.bottom, insets.right, insets.top, layoutH, layoutW, restX, restY, translateX, translateY],
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
    const minY = insetTop.value + EDGE_MARGIN;
    const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;
    const targetX = maxX;
    const targetY = minY;
    sheetOpacity.value = 0;
    if (secondaryChannel) {
      secondaryDeltaX.value = 0;
      secondaryOpacity.value = 0;
    }
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
      if (secondaryChannel) {
        const split = BUBBLE_SIZE + BUBBLE_GAP;
        secondaryDeltaX.value = withSpring(-split, {
          stiffness: 200,
          damping: 20,
          mass: 0.9,
        });
        secondaryOpacity.value = withTiming(1, { duration: 180 });
      }
      expandSheetTimeoutRef.current = null;
    }, EXPAND_SHEET_DELAY_MS);
  }, [
    clearExpandTimer,
    insetBottom,
    insetLeft,
    insetRight,
    insetTop,
    layoutH,
    layoutW,
    secondaryChannel,
    secondaryDeltaX,
    secondaryOpacity,
    sheetOpacity,
    translateX,
    translateY,
  ]);

  const finishCollapse = useCallback(() => {
    const w = layoutW.value;
    const h = layoutH.value;
    const minX = insetLeft.value + EDGE_MARGIN;
    const maxX = w - insetRight.value - BUBBLE_SIZE - EDGE_MARGIN;
    const minY = insetTop.value + EDGE_MARGIN;
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
  }, [
    insetBottom,
    insetLeft,
    insetRight,
    insetTop,
    layoutH,
    layoutW,
    setExpandedFalse,
    translateX,
    translateY,
    restX,
    restY,
  ]);

  const beginCollapse = useCallback(() => {
    clearExpandTimer();
    secondaryDeltaX.value = withTiming(0, { duration: MORPH_MS });
    secondaryOpacity.value = withTiming(0, { duration: MORPH_MS });
    sheetOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      "worklet";
      if (finished) {
        scheduleOnRN(finishCollapse);
      }
    });
  }, [clearExpandTimer, finishCollapse, secondaryDeltaX, secondaryOpacity, sheetOpacity]);

  const handleCollapsedTap = useCallback(() => {
    beginExpand();
  }, [beginExpand]);

  const handleSelectChannel = useCallback(
    (id: FloatingDmChannelId) => {
      setActiveChannelId(id);
      onChannelChange?.(id);
    },
    [onChannelChange],
  );

  const handleExpandedBubbleTap = useCallback(
    (channelId: FloatingDmChannelId) => {
      if (channelId === activeChannelId) {
        if (activeChannelId !== primaryChannel.id) {
          setActiveChannelId(primaryChannel.id);
          onChannelChange?.(primaryChannel.id);
        }
        beginCollapse();
      } else {
        handleSelectChannel(channelId);
      }
    },
    [
      activeChannelId,
      beginCollapse,
      handleSelectChannel,
      onChannelChange,
      primaryChannel.id,
    ],
  );

  const expandTick = useDmBubbleShellStore((s) => s.expandTick);
  const prevExpandTickRef = useRef(0);
  useEffect(() => {
    if (expandTick === 0) {
      prevExpandTickRef.current = 0;
      return;
    }
    if (expandTick !== prevExpandTickRef.current) {
      prevExpandTickRef.current = expandTick;
      if (!expanded) {
        beginExpand();
      }
    }
  }, [beginExpand, expandTick, expanded]);

  const prevExpandedForCollapseEmitRef = useRef(false);
  useEffect(() => {
    if (prevExpandedForCollapseEmitRef.current && !expanded) {
      useDmBubbleShellStore.getState().emitBubbleCollapsed();
    }
    prevExpandedForCollapseEmitRef.current = expanded;
  }, [expanded]);

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
          const minY = insetTop.value + EDGE_MARGIN;
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
          const minY = insetTop.value + EDGE_MARGIN;
          const maxY = h - insetBottom.value - BUBBLE_SIZE - EDGE_MARGIN;

          const fingerX = Math.min(
            rightSnap,
            Math.max(leftSnap, panAnchorX.value + e.translationX),
          );
          const fingerY = Math.min(
            maxY,
            Math.max(minY, panAnchorY.value + e.translationY),
          );

          cancelAnimation(translateX);
          cancelAnimation(translateY);
          translateX.value = fingerX;
          translateY.value = fingerY;

          const vx = e.velocityX;
          const vy = e.velocityY;
          const flingStrength = Math.hypot(
            vx,
            vy * VERTICAL_VELOCITY_WEIGHT_FOR_FLING_STRENGTH,
          );
          const softEnergeticThrow =
            flingStrength >= FLING_STRENGTH_FOR_THROW_SETTLE &&
            flingStrength < FLING_STRENGTH_FOR_CORNER_COMMIT;
          const hardCornerThrow =
            flingStrength >= FLING_STRENGTH_FOR_CORNER_COMMIT;

          if (hardCornerThrow) {
            const corner = cornerTargetFromRay(
              fingerX,
              fingerY,
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
            const rawPredX = fingerX + vx * THROW_PROJECTION_S;
            const rawPredY = fingerY + vy * THROW_PROJECTION_S;
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
    [
      commitRestPosition,
      expanded,
      insetBottom,
      insetLeft,
      insetRight,
      insetTop,
      layoutH,
      layoutW,
      panAnchorX,
      panAnchorY,
      restX,
      restY,
      translateX,
      translateY,
    ],
  );

  const collapseTapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        scheduleOnRN(handleCollapsedTap);
      }),
    [handleCollapsedTap],
  );

  const collapseGesture = useMemo(
    () => Gesture.Race(panGesture, collapseTapGesture),
    [collapseTapGesture, panGesture],
  );

  const expandedPrimaryTap = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        scheduleOnRN(handleExpandedBubbleTap, primaryChannel.id);
      }),
    [handleExpandedBubbleTap, primaryChannel.id],
  );

  const expandedSecondaryTap = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        if (secondaryChannel) {
          scheduleOnRN(handleExpandedBubbleTap, secondaryChannel.id);
        }
      }),
    [handleExpandedBubbleTap, secondaryChannel],
  );

  const expandedSingleTap = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        scheduleOnRN(handleExpandedBubbleTap, activeChannelId);
      }),
    [activeChannelId, handleExpandedBubbleTap],
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const secondaryBubbleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + secondaryDeltaX.value },
      { translateY: translateY.value },
    ],
    opacity: secondaryOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
  }));

  // REV2_INFERRED: Sheet subtree (including DirectMessagesContainer) mounts only while `expanded`
  // is true — snappy follow-up is to keep sheet mounted and toggle pointerEvents + opacity only.

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      onLayout={handleOverlayLayout}
    >
      {expanded ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.sheetWrap,
            {
              top: BUBBLE_SIZE + EDGE_MARGIN * 2 + insets.top,
              left: EDGE_MARGIN,
              right: EDGE_MARGIN,
              bottom: 0,
            },
            sheetStyle,
          ]}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: activeChannel.sheetBackgroundColor },
            ]}
            pointerEvents="auto"
          >
            <Text style={[styles.sheetTitle, { color: sheetChrome.sheetTitleColor }]}>
              {activeChannel.sheetTitle}
            </Text>
            <View style={styles.channelRow}>
              {channels.map((ch) => {
                const selected = ch.id === activeChannelId;
                return (
                  <Pressable
                    key={ch.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectChannel(ch.id)}
                    style={[
                      styles.channelPill,
                      { backgroundColor: sheetChrome.channelPillBackground },
                      selected && [
                        styles.channelPillSelected,
                        {
                          backgroundColor: sheetChrome.channelPillSelectedBackground,
                          borderColor: sheetChrome.channelPillBorderColor,
                        },
                      ],
                    ]}
                  >
                    <Text style={[styles.channelPillLabel, { color: sheetChrome.channelPillLabelColor }]}>
                      {ch.label}
                    </Text>
                    {ch.unreadCount != null && ch.unreadCount > 0 ? (
                      <View
                        style={[styles.unreadBadge, { backgroundColor: sheetChrome.unreadBadgeBackground }]}
                      >
                        <Text style={[styles.unreadBadgeText, { color: sheetChrome.unreadBadgeTextColor }]}>
                          {ch.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sheetBody}>
              {activeChannelId === "inbox" ? (
                <DirectMessagesContainer />
              ) : modmailManagedCommunityIds.length > 0 ? (
                <View style={styles.modmailPanelWrap}>
                  <MobileModmailPanel managedCommunityIds={modmailManagedCommunityIds} />
                </View>
              ) : (
                <View style={styles.modmailPlaceholder}>
                  <Text style={[styles.sheetPlaceholder, { color: sheetChrome.sheetPlaceholderColor }]}>
                    ModMail appears when you can manage reports in at least one community.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      ) : null}
      {!expanded ? (
        <GestureDetector gesture={collapseGesture}>
          <Animated.View
            accessibilityLabel={`${activeChannel.label} — floating messages entry`}
            accessibilityRole="button"
            style={[
              styles.bubble,
              { backgroundColor: activeChannel.bubbleColor },
              bubbleStyle,
            ]}
          >
            <BubbleFaceIcon channel={activeChannel} />
          </Animated.View>
        </GestureDetector>
      ) : secondaryChannel ? (
        <View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, styles.dualBubbleCluster]}
        >
          <GestureDetector gesture={expandedSecondaryTap}>
            <Animated.View
              accessibilityLabel={`${secondaryChannel.label} — floating messages entry`}
              accessibilityRole="button"
              style={[
                styles.bubble,
                styles.bubbleBehind,
                { backgroundColor: secondaryChannel.bubbleColor },
                activeChannelId === secondaryChannel.id && [
                  styles.bubbleActive,
                  { borderColor: sheetChrome.bubbleActiveBorderColor },
                ],
                secondaryBubbleStyle,
              ]}
            >
              <BubbleFaceIcon channel={secondaryChannel} />
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={expandedPrimaryTap}>
            <Animated.View
              accessibilityLabel={`${primaryChannel.label} — floating messages entry`}
              accessibilityRole="button"
              style={[
                styles.bubble,
                styles.bubbleFront,
                { backgroundColor: primaryChannel.bubbleColor },
                activeChannelId === primaryChannel.id && [
                  styles.bubbleActive,
                  { borderColor: sheetChrome.bubbleActiveBorderColor },
                ],
                bubbleStyle,
              ]}
            >
              <BubbleFaceIcon channel={primaryChannel} />
            </Animated.View>
          </GestureDetector>
        </View>
      ) : (
        <GestureDetector gesture={expandedSingleTap}>
          <Animated.View
            accessibilityLabel={`${activeChannel.label} — floating messages entry`}
            accessibilityRole="button"
            style={[
              styles.bubble,
              { backgroundColor: activeChannel.bubbleColor },
              styles.bubbleActive,
              { borderColor: sheetChrome.bubbleActiveBorderColor },
              bubbleStyle,
            ]}
          >
            <BubbleFaceIcon channel={activeChannel} />
          </Animated.View>
        </GestureDetector>
      )}
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
    overflow: "hidden",
    // uniwind-theme-allow mobile-theme/no-raw-style-color - bubble drop shadow; invariant black across all themes
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  dualBubbleCluster: {
    zIndex: 2,
    overflow: "visible",
  },
  bubbleBehind: {
    zIndex: 0,
    elevation: 2,
  },
  bubbleFront: {
    zIndex: 50,
    elevation: 24,
  },
  bubbleActive: {
    borderWidth: 3,
  },
  sheetWrap: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 16,
  },
  sheet: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 0,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
  },
  modmailPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  modmailPanelWrap: {
    flex: 1,
    minHeight: 0,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 8,
  },
  sheetPlaceholder: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  channelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  channelPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  channelPillSelected: {
    borderWidth: 1,
  },
  channelPillLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
