import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useChatSurfaceChrome } from "@/components/chat/ChatSurfaceContext";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { ThemedIonicons } from "@/theme-rn";
import {
  CHAT_COMPOSER_NATIVE_ID,
  COMPOSER_SELECTION_COLOR,
} from "@/components/chat/chatSurfaceConstants";
import { CHAT_COMPOSER_INPUT_STYLE } from "@/components/chat/chatTypography";
import type { ChatComposerColors } from "@/components/chat/useChatComposerColors";

export type ChatComposerProps = {
  inputRef: React.RefObject<EnrichedMarkdownTextInputInstance | null>;
  colors: ChatComposerColors;
  isSending: boolean;
  isPickingMedia: boolean;
  canSend: boolean;
  onChangeMarkdown: (markdown: string) => void;
  onSend: () => void;
  onPickMedia: () => void;
  /** Strips above the input row (reply, pending media, etc.). */
  strips?: React.ReactNode;
  sendAccessibilityLabel?: string;
};

export function ChatComposer({
  inputRef,
  colors,
  isSending,
  isPickingMedia,
  canSend,
  onChangeMarkdown,
  onSend,
  onPickMedia,
  strips,
  sendAccessibilityLabel = "Send message",
}: ChatComposerProps) {
  const { composerBackdropAnimatedStyle, composerChromeAnimatedStyle } = useChatSurfaceChrome();

  return (
    <>
      {strips}

      <View className="flex-row items-end gap-2 bg-transparent px-3 pb-3 pt-2.5">
        <Animated.View
          style={[
            {
              minHeight: CHAT_COMPOSER_INPUT_STYLE.minHeight,
              justifyContent: "center",
            },
            composerChromeAnimatedStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add media"
            disabled={isSending || isPickingMedia}
            onPress={onPickMedia}
            className="relative h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-foreground/10 disabled:opacity-50"
          >
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  bottom: 3,
                  left: 3,
                  right: 3,
                  top: 3,
                },
                composerBackdropAnimatedStyle,
              ]}
              className="rounded-full bg-background"
            />
            <ThemedIonicons name="add" size={22} colorClassName="accent-primary-foreground" />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[{ flex: 1, flexDirection: "row", alignItems: "flex-end" }, composerChromeAnimatedStyle]}
        >
          <View className="relative flex-1 flex-row items-center overflow-hidden rounded-[20px] border border-foreground/10 bg-foreground/8 pr-1">
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  bottom: 2,
                  left: 2,
                  right: 2,
                  top: 2,
                },
                composerBackdropAnimatedStyle,
              ]}
              className="rounded-[18px] bg-background"
            />
            <EnrichedMarkdownTextInput
              ref={inputRef}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {...({ nativeID: CHAT_COMPOSER_NATIVE_ID } as any)}
              multiline
              editable={!isSending}
              scrollEnabled
              defaultValue=""
              onChangeMarkdown={onChangeMarkdown}
              placeholder="Type a message..."
              placeholderTextColor={colors.placeholder}
              cursorColor={colors.cursor}
              selectionColor={COMPOSER_SELECTION_COLOR}
              markdownStyle={{
                strong: { color: colors.text },
                em: { color: colors.text },
                link: { color: colors.link, underline: true },
                spoiler: { color: colors.spoiler, backgroundColor: "rgba(0,0,0,0.2)" },
              }}
              style={{
                flex: 1,
                ...CHAT_COMPOSER_INPUT_STYLE,
                color: colors.text,
              }}
            />
            <Pressable
              onPress={onSend}
              disabled={isSending || !canSend}
              accessibilityRole="button"
              accessibilityLabel={sendAccessibilityLabel}
              style={{
                opacity: canSend ? (isSending ? 0.55 : 1) : 0,
                pointerEvents: canSend ? "auto" : "none",
              }}
              className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary"
            >
              <ThemedIonicons name="arrow-up" size={20} colorClassName="accent-primary-foreground" />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </>
  );
}
