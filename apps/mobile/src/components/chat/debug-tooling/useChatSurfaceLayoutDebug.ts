import { useCallback, useEffect, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import { KeyboardController, useKeyboardHandler } from "react-native-keyboard-controller";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_SURFACE_MARGIN } from "@/components/chat/chatSurfaceConstants";
import {
  buildChatSurfaceLayoutSnapshot,
  logChatSurfaceLayoutSnapshot,
  type ChatSurfaceKeyboardPhase,
  isChatSurfaceLayoutDebugEnabled,
} from "@/components/chat/debug-tooling/chatSurfaceLayoutDebug";
import type { UseChatSurfaceLayoutDebugOptions } from "@/components/chat/debug-tooling/layoutDebugIntegration";

export type { UseChatSurfaceLayoutDebugOptions };

type KeyboardTrack = {
  visible: boolean;
  height: number;
  progress: number;
  lastPhase: ChatSurfaceKeyboardPhase | null;
  lastChangeTs: string | null;
};

export function useChatSurfaceLayoutDebug({
  surface,
  extraContentPadding,
  keyboardScrollProps,
}: UseChatSurfaceLayoutDebugOptions) {
  const { bottom } = useSafeAreaInsets();
  const enabled = isChatSurfaceLayoutDebugEnabled();

  const keyboardRef = useRef<KeyboardTrack>({
    visible: false,
    height: 0,
    progress: 0,
    lastPhase: null,
    lastChangeTs: null,
  });
  const stickyHeightRef = useRef<number | null>(null);
  const scrollInvertedRef = useRef<boolean | undefined>(undefined);
  const scrollInvertedExplicitRef = useRef(false);
  const scrollViewLayoutRef = useRef<{ width: number; height: number } | null>(null);
  const chatHostLayoutRef = useRef<{ width: number; height: number } | null>(null);
  const kcsvMountedRef = useRef(false);
  const extraTargetRef = useRef<number | null>(null);
  const extraSettledRef = useRef<number | null>(null);

  const emit = useCallback(
    (event: string, keyboardPhase?: ChatSurfaceKeyboardPhase) => {
      if (!enabled) return;

      const keyboard = keyboardRef.current;
      let controllerIsVisible: boolean | undefined;
      try {
        controllerIsVisible = KeyboardController.isVisible();
      } catch {
        controllerIsVisible = undefined;
      }

      const snapshot = buildChatSurfaceLayoutSnapshot({
        event,
        surface,
        safeAreaBottom: bottom,
        keyboard: {
          phase: keyboardPhase ?? keyboard.lastPhase ?? undefined,
          visible: keyboard.visible,
          height: keyboard.height,
          progress: keyboard.progress,
          controllerIsVisible,
        },
        scrollView: {
          offset: bottom - CHAT_SURFACE_MARGIN,
          keyboardLiftBehavior: keyboardScrollProps?.keyboardLiftBehavior,
          invertedProp: scrollInvertedRef.current,
          invertedExplicitOnKcsv: scrollInvertedExplicitRef.current,
        },
        composer: {
          stickyLayoutHeight: stickyHeightRef.current,
          extraContentPaddingLive: extraContentPadding.value,
          extraContentPaddingTarget: extraTargetRef.current,
          extraContentPaddingSettled: extraSettledRef.current,
        },
        diagnostics: {
          scrollViewLayout: scrollViewLayoutRef.current,
          chatHostLayout: chatHostLayoutRef.current,
          keyboardChatScrollViewMounted: kcsvMountedRef.current,
          extraPaddingTargetLast: extraTargetRef.current,
          extraPaddingSettledLast: extraSettledRef.current,
        },
      });

      logChatSurfaceLayoutSnapshot(snapshot);
    },
    [bottom, enabled, extraContentPadding, keyboardScrollProps?.keyboardLiftBehavior, surface],
  );

  const syncKeyboardTrack = useCallback(
    (phase: ChatSurfaceKeyboardPhase, height: number, progress: number, shouldEmit: boolean) => {
      const visible = height > 0 || progress > 0.01;
      const prevVisible = keyboardRef.current.visible;

      keyboardRef.current = {
        visible,
        height,
        progress,
        lastPhase: phase,
        lastChangeTs: new Date().toISOString(),
      };

      if (!shouldEmit) return;

      const eventLabel = !prevVisible && visible
        ? "keyboard:OPENED"
        : prevVisible && !visible
          ? "keyboard:CLOSED"
          : `keyboard:${phase}`;

      emit(eventLabel, phase);
    },
    [emit],
  );

  useKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        runOnJS(syncKeyboardTrack)("willShow", event.height, event.progress, true);
      },
      onMove: (event) => {
        "worklet";
        runOnJS(syncKeyboardTrack)("move", event.height, event.progress, false);
      },
      onInteractive: (event) => {
        "worklet";
        runOnJS(syncKeyboardTrack)("interactive", event.height, event.progress, true);
      },
      onEnd: (event) => {
        "worklet";
        const phase: ChatSurfaceKeyboardPhase = event.progress > 0.01 ? "didShow" : "didHide";
        runOnJS(syncKeyboardTrack)(phase, event.height, event.progress, true);
      },
    },
    [syncKeyboardTrack],
  );

  useAnimatedReaction(
    () => extraContentPadding.value,
    (next, prev) => {
      if (prev === null || next === prev) return;
      runOnJS(emit)(`extraContentPadding:live ${prev ?? 0}->${next}`);
    },
    [emit],
  );

  useEffect(() => {
    if (!enabled) return;
    emit("mount");
    const t1 = setTimeout(() => emit("probe:t+500ms"), 500);
    const t2 = setTimeout(() => emit("probe:t+1500ms"), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      emit("unmount");
    };
  }, [emit, enabled]);

  const onComposerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.round(event.nativeEvent.layout.height * 10) / 10;
      const prev = stickyHeightRef.current;
      stickyHeightRef.current = height;

      if (!enabled) return;
      if (prev !== height) {
        emit(`composer:onLayout ${prev ?? "null"}->${height}`);
      }
    },
    [emit, enabled],
  );

  const onExtraPaddingTarget = useCallback(
    (target: number) => {
      extraTargetRef.current = target;
      if (!enabled) return;
      emit(`extraContentPadding:target ${target}`);
    },
    [emit, enabled],
  );

  const onExtraPaddingSettled = useCallback(
    (settled: number, finished: boolean) => {
      extraSettledRef.current = settled;
      if (!enabled) return;
      emit(`extraContentPadding:settled ${settled} finished=${finished}`);
    },
    [emit, enabled],
  );

  const onScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      const next = {
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
      };
      const prev = scrollViewLayoutRef.current;
      scrollViewLayoutRef.current = next;
      if (!enabled) return;
      if (!prev || prev.width !== next.width || prev.height !== next.height) {
        emit(`scrollView:onLayout ${prev?.width ?? "?"}x${prev?.height ?? "?"} -> ${next.width}x${next.height}`);
      }
    },
    [emit, enabled],
  );

  const onChatHostLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      const next = {
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
      };
      const prev = chatHostLayoutRef.current;
      chatHostLayoutRef.current = next;
      if (!enabled) return;
      if (!prev || prev.width !== next.width || prev.height !== next.height) {
        emit(`chatHost:onLayout ${prev?.width ?? "?"}x${prev?.height ?? "?"} -> ${next.width}x${next.height}`);
      }
    },
    [emit, enabled],
  );

  const noteKeyboardChatScrollViewMounted = useCallback(
    (input: {
      invertedFromProps?: boolean;
      invertedExplicit: boolean;
      hasExtraContentPadding: boolean;
    }) => {
      kcsvMountedRef.current = true;
      scrollInvertedRef.current = input.invertedFromProps;
      scrollInvertedExplicitRef.current = input.invertedExplicit;
      if (!enabled) return;
      emit(
        `scrollView:KeyboardChatScrollView mounted inverted=${String(input.invertedFromProps)} explicit=${String(input.invertedExplicit)} hasExtraContentPadding=${String(input.hasExtraContentPadding)} rnkc=1.21.0 (inset computed, no onContentInsetChange)`,
      );
    },
    [emit, enabled],
  );

  const noteScrollComponentProps = useCallback(
    (props: { inverted?: boolean }) => {
      if (scrollInvertedRef.current !== props.inverted) {
        scrollInvertedRef.current = props.inverted;
        if (enabled) {
          emit(`scrollView:FlatList renderScrollComponent inverted=${String(props.inverted)}`);
        }
      }
    },
    [emit, enabled],
  );

  return {
    enabled,
    onComposerLayout,
    onExtraPaddingTarget,
    onExtraPaddingSettled,
    onScrollViewLayout,
    onChatHostLayout,
    noteKeyboardChatScrollViewMounted,
    noteScrollComponentProps,
    emit,
  };
}
