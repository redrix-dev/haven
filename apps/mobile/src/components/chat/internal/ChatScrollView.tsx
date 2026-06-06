/**
 * @internal Sole `KeyboardChatScrollView` wrapper for Haven mobile.
 * Import only from `ChatInterface.tsx` — never from screens or features.
 */
import type { ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
} from "react-native-keyboard-controller";
import { CHAT_SURFACE_MARGIN } from "@/components/chat/chatSurfaceConstants";

type ChatScrollViewProps = ScrollViewProps & KeyboardChatScrollViewProps;

export function ChatScrollView({
  inverted,
  onLayout: scrollOnLayout,
  extraContentPadding,
  ...props
}: ChatScrollViewProps) {
  const { bottom } = useSafeAreaInsets();
  const invertedExplicit = inverted === true;

  return (
    <KeyboardChatScrollView
      {...props}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom - CHAT_SURFACE_MARGIN}
      inverted={invertedExplicit ? true : inverted}
      extraContentPadding={extraContentPadding}
      onLayout={scrollOnLayout}
    />
  );
}
