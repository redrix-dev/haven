import { useCallback } from "react";
import {
  FlatList,
  View,
  type FlatListProps,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSharedValue, withTiming } from "react-native-reanimated";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import { ChatScrollView } from "@/components/chat/internal/ChatScrollView";
import {
  CHAT_COMPOSER_MIN_HEIGHT,
  CHAT_COMPOSER_NATIVE_ID,
  CHAT_LIST_TOP_PADDING,
  CHAT_SURFACE_MARGIN,
} from "@/components/chat/chatSurfaceConstants";
import { ChatSurfaceProvider } from "@/components/chat/ChatSurfaceContext";
import { useChatComposerChrome } from "@/components/chat/useChatComposerChrome";

const EXTRA_PADDING_ANIM_MS = 220;

/**
 * Canonical RNKC chat shell (inverted list + sticky composer).
 *
 * Screens must use this component — not `KeyboardChatScrollView`, `KeyboardStickyView`,
 * or ad-hoc `SafeAreaView` / `paddingTop` for message clearance.
 *
 * @see .cursor/skills/haven-mobile-chat-surface/SKILL.md
 * Layout diagnostics: `@/components/chat/debug-tooling`
 */
export type ChatInterfaceProps<T> = Omit<
  FlatListProps<T>,
  | "inverted"
  | "keyboardShouldPersistTaps"
  | "scrollEventThrottle"
  | "contentContainerStyle"
  | "renderScrollComponent"
  | "onScrollBeginDrag"
  | "onScrollEndDrag"
  | "onMomentumScrollBegin"
  | "onMomentumScrollEnd"
  | "ref"
> & {
  listRef?: React.RefObject<FlatList<T> | null>;
  composer: React.ReactNode;
  /** When set, replaces the message list (e.g. loading spinner). Composer stays mounted. */
  listPlaceholder?: React.ReactNode;
  /** Passed through to the underlying keyboard-aware scroll view. */
  keyboardScrollProps?: Pick<KeyboardChatScrollViewProps, "keyboardLiftBehavior">;
  /** Android: set false on the composer wrapper to avoid sticky layout collapse. */
  composerCollapsable?: boolean;
};

export function ChatInterface<T>({
  composer,
  listPlaceholder,
  keyboardScrollProps,
  composerCollapsable,
  listRef,
  className,
  ...listProps
}: ChatInterfaceProps<T>) {
  const { bottom } = useSafeAreaInsets();
  const extraContentPadding = useSharedValue(0);
  const chrome = useChatComposerChrome();
  const { listScrollHandlers } = chrome;

  const applyExtraContentPadding = useCallback(
    (height: number) => {
      const target = Math.max(height - CHAT_COMPOSER_MIN_HEIGHT, 0);
      extraContentPadding.value = withTiming(target, {
        duration: EXTRA_PADDING_ANIM_MS,
      });
    },
    [extraContentPadding],
  );

  const onComposerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      applyExtraContentPadding(event.nativeEvent.layout.height);
    },
    [applyExtraContentPadding],
  );

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView
        {...props}
        inverted={(props as { inverted?: boolean }).inverted ?? true}
        extraContentPadding={extraContentPadding}
        {...keyboardScrollProps}
      />
    ),
    [extraContentPadding, keyboardScrollProps],
  );

  return (
    <ChatSurfaceProvider
      value={{
        composerBackdropAnimatedStyle: chrome.composerBackdropAnimatedStyle,
        composerChromeAnimatedStyle: chrome.composerChromeAnimatedStyle,
      }}
    >
      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <KeyboardGestureArea
          interpolator="ios"
          offset={CHAT_COMPOSER_MIN_HEIGHT}
          style={{ flex: 1 }}
          textInputNativeID={CHAT_COMPOSER_NATIVE_ID}
        >
          <View className="flex-1">
            {listPlaceholder ?? (
              <FlatList
                ref={listRef}
                {...listProps}
                className={className ?? "flex-1"}
                inverted
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: CHAT_LIST_TOP_PADDING }}
                renderScrollComponent={renderScrollComponent}
                {...listScrollHandlers}
              />
            )}

            <KeyboardStickyView
              offset={{ opened: bottom - CHAT_SURFACE_MARGIN }}
              onLayout={onComposerLayout}
              style={{
                position: "absolute",
                width: "100%",
                bottom: CHAT_SURFACE_MARGIN,
              }}
            >
              <View collapsable={composerCollapsable === false ? false : undefined}>
                {composer}
              </View>
            </KeyboardStickyView>
          </View>
        </KeyboardGestureArea>
      </SafeAreaView>
    </ChatSurfaceProvider>
  );
}
