import type { ScrollViewProps } from "react-native";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
} from "react-native-keyboard-controller";

const MARGIN = 8;

type ChatScrollViewProps = ScrollViewProps & KeyboardChatScrollViewProps;

export function ChatScrollView(props: ChatScrollViewProps) {
  return (
    <KeyboardChatScrollView
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={MARGIN}
      {...props}
    />
  );
}