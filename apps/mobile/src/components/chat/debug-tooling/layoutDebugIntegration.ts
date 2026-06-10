import type { LayoutChangeEvent } from "react-native";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";

/** Optional props to add back to `internal/ChatScrollView` when debugging. */
export type ChatScrollViewLayoutDebugProps = {
  debugOnMount?: (info: {
    invertedFromProps?: boolean;
    invertedExplicit: boolean;
    hasExtraContentPadding: boolean;
  }) => void;
  debugOnLayout?: (event: LayoutChangeEvent) => void;
};

/** Return value of `useChatSurfaceLayoutDebug` — wire into `ChatInterface` when investigating layout. */
export type ChatSurfaceLayoutDebugBindings = {
  enabled: boolean;
  onComposerLayout: (event: LayoutChangeEvent) => void;
  onExtraPaddingTarget: (target: number) => void;
  onExtraPaddingSettled: (settled: number, finished: boolean) => void;
  onScrollViewLayout: (event: LayoutChangeEvent) => void;
  onChatHostLayout: (event: LayoutChangeEvent) => void;
  noteKeyboardChatScrollViewMounted: ChatScrollViewLayoutDebugProps["debugOnMount"];
  noteScrollComponentProps: (props: { inverted?: boolean }) => void;
  emit: (event: string) => void;
};

export type UseChatSurfaceLayoutDebugOptions = {
  surface?: string;
  extraContentPadding: SharedValue<number>;
  keyboardScrollProps?: Pick<
    KeyboardChatScrollViewProps,
    "keyboardLiftBehavior"
  >;
};
