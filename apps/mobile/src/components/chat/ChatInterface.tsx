import { useCallback } from "react";
import { FlatList, Platform, View, type FlatListProps, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import { ChatScrollView } from "@/features/community/ChatScrollView";
import { CHAT_LIST_TOP_PADDING, CHAT_SURFACE_MARGIN } from "@/components/chat/chatSurfaceConstants";
import { ChatSurfaceProvider } from "@/components/chat/ChatSurfaceContext";
import { useChatComposerChrome } from "@/components/chat/useChatComposerChrome";

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
  const composerHeight = useSharedValue(0);
  const adjustedBlankSpace = useDerivedValue(() => composerHeight.value - bottom);
  const chrome = useChatComposerChrome();
  const { listScrollHandlers } = chrome;

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} blankSpace={adjustedBlankSpace} {...keyboardScrollProps} />
    ),
    [adjustedBlankSpace, keyboardScrollProps],
  );

  return (
    <ChatSurfaceProvider value={{ composerChromeAnimatedStyle: chrome.composerChromeAnimatedStyle }}>
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
          onLayout={(e) => {
            composerHeight.value = e.nativeEvent.layout.height;
          }}
          style={{
            position: "absolute",
            width: "100%",
            bottom: bottom - CHAT_SURFACE_MARGIN,
          }}
        >
          <View collapsable={composerCollapsable === false ? false : undefined}>{composer}</View>
        </KeyboardStickyView>
      </View>
    </ChatSurfaceProvider>
  );
}
