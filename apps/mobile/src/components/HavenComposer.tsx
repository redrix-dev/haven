import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  View,
} from "react-native";

type HavenComposerProps = {
  disabled: boolean;
  isSending: boolean;
  onSend: (payload: {
    content: string;
    mediaAsset?: { uri: string; fileName: string; mimeType: string };
  }) => Promise<void>;
};

function resolveMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === "video") return "video/mp4";
  return "image/jpeg";
}

export function HavenComposer({ disabled, isSending, onSend }: HavenComposerProps) {
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const safeBottom = insets.bottom || 0;

  // Reanimated `height` is negative while the keyboard is open (negated in KeyboardProvider).
  const shellStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      backgroundColor: "#0F1728",
      paddingBottom: keyboardHeight.value < 0 ? 0 : safeBottom,
    };
  }, [safeBottom]);

  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const handleChangeMarkdown = (markdown: string) => {
    setDraft(markdown);
    console.log("[HavenComposer] markdown payload", markdown);
  };

  const handleAttach = async () => {
    if (disabled || isSending) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled) return;
    const first = result.assets[0];
    if (!first?.uri) return;
    setPendingAttachment({
      uri: first.uri,
      fileName: first.fileName ?? `upload-${Date.now()}`,
      mimeType: resolveMimeType(first),
    });
  };

  const showComposerActionSheet = () => {
    if (disabled || isSending) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Add media"], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) void handleAttach();
        },
      );
    } else {
      Alert.alert("", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Add media", onPress: () => void handleAttach() },
      ]);
    }
  };

  const handleSend = async () => {
    if (disabled || isSending) return;
    const fromInput = inputRef.current ? await inputRef.current.getMarkdown() : draft;
    const content = fromInput.trim();
    if (!content && !pendingAttachment) return;
    await onSend({
      content,
      mediaAsset: pendingAttachment ?? undefined,
    });
    setDraft("");
    inputRef.current?.setValue("");
    setPendingAttachment(null);
  };

  const sendIconColor =
    draft.trim().length > 0 || pendingAttachment != null ? "#3F79D8" : "#4a5568";


  return (
    <Animated.View style={shellStyle}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#1e2d45",
          borderRadius: 24,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginHorizontal: 12,
          marginTop: 8,
        }}
      >
        <Pressable
          accessibilityLabel="Message options"
          accessibilityRole="button"
          hitSlop={8}
          disabled={disabled || isSending}
          onPress={showComposerActionSheet}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#a9b8cf" />
        </Pressable>
        <EnrichedMarkdownTextInput
          ref={inputRef}
          multiline
          editable={!disabled && !isSending}
          scrollEnabled
          defaultValue=""
          onChangeMarkdown={handleChangeMarkdown}
          placeholder={
            disabled ? "Select a text channel to start chatting" : "Message channel"
          }
          placeholderTextColor="#a9b8cf"
          cursorColor="#e6edf7"
          selectionColor="rgba(63, 121, 216, 0.4)"
          markdownStyle={{
            strong: { color: "#e6edf7" },
            em: { color: "#e6edf7" },
            link: { color: "#3F79D8", underline: true },
            spoiler: { color: "#a9b8cf", backgroundColor: "rgba(0,0,0,0.2)" },
          }}
          style={{
            flex: 1,
            maxHeight: 120,
            color: "#e6edf7",
            fontSize: 15,
            lineHeight: 22,
            paddingTop: 10,
            paddingBottom: 10,
            paddingHorizontal: 4,
            backgroundColor: "transparent",
          }}
        />
        <Pressable
          accessibilityLabel="Send message"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => void handleSend()}
        >
          <Ionicons name="arrow-up-circle" size={28} color={sendIconColor} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
