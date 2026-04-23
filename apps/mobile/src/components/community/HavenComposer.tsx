import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput as RNTextInput,
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
  const inputRef = useRef<RNTextInput | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);

  useEffect(() => {
    const show = KeyboardEvents.addListener("keyboardWillShow", () => {
      setKeyboardOpen(true);
    });
    const hide = KeyboardEvents.addListener("keyboardWillHide", () => {
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const wrapSelection = (before: string, after: string = before) => {
    const { start, end } = selection;
    const selected = draft.substring(start, end);
    const newText =
      draft.substring(0, start) + before + selected + after + draft.substring(end);
    setDraft(newText);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const insertLinePrefix = (prefix: string) => {
    const { start } = selection;
    const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
    const newText = draft.substring(0, lineStart) + prefix + draft.substring(lineStart);
    setDraft(newText);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleAttach = async () => {
    if (disabled || isSending) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
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
        { options: ["Cancel", "Add Media", "Format Text"], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) void handleAttach();
          if (buttonIndex === 2) setShowFormatToolbar(true);
        },
      );
    } else {
      Alert.alert("", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Add Media", onPress: () => void handleAttach() },
        { text: "Format Text", onPress: () => setShowFormatToolbar(true) },
      ]);
    }
  };

  const handleSend = async () => {
    if (disabled || isSending) return;
    const content = draft.trim();
    if (!content && !pendingAttachment) return;
    await onSend({
      content,
      mediaAsset: pendingAttachment ?? undefined,
    });
    setDraft("");
    setPendingAttachment(null);
  };

  const sendIconColor =
    draft.trim().length > 0 || pendingAttachment != null ? "#3F79D8" : "#4a5568";

  return (
    <View
      style={{
        backgroundColor: "#0F1728",
        paddingBottom: keyboardOpen ? 0 : insets.bottom || 0,
      }}
    >
      {showFormatToolbar ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: "#0F1728",
          }}
        >
          <Pressable onPress={() => wrapSelection("**")}>
            <Text style={{ color: "#e6edf7", fontWeight: "700", fontSize: 15 }}>B</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("*")}>
            <Text style={{ color: "#e6edf7", fontStyle: "italic", fontSize: 15 }}>I</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("~~")}>
            <Text style={{ color: "#e6edf7", textDecorationLine: "line-through", fontSize: 15 }}>
              S
            </Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("`")}>
            <Text style={{ color: "#e6edf7", fontFamily: "monospace", fontSize: 15 }}>
              {"<>"}
            </Text>
          </Pressable>
          <Pressable onPress={() => insertLinePrefix("> ")}>
            <Text style={{ color: "#e6edf7", fontSize: 15 }}>❝</Text>
          </Pressable>
          <Pressable onPress={() => setShowFormatToolbar(false)}>
            <Text style={{ color: "#a9b8cf", fontSize: 15 }}>✕</Text>
          </Pressable>
        </View>
      ) : null}
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
          marginBottom: 0,
        }}
      >
        <Pressable
          accessibilityLabel="Message options"
          accessibilityRole="button"
          hitSlop={8}
          disabled={disabled || isSending}
          onPress={showComposerActionSheet}
          onLongPress={() => setShowFormatToolbar(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#a9b8cf" />
        </Pressable>
        <RNTextInput
          ref={inputRef}
          multiline
          blurOnSubmit={false}
          returnKeyType="default"
          value={draft}
          onChangeText={setDraft}
          onSelectionChange={(e) => {
            setSelection(e.nativeEvent.selection);
          }}
          editable={!disabled && !isSending}
          placeholder={disabled ? "Select a text channel to start chatting" : "Message channel"}
          placeholderTextColor="#a9b8cf"
          scrollEnabled
          maxHeight={120}
          style={{
            flex: 1,
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
    </View>
  );
}
