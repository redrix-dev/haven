import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type StyleState,
} from "react-native-enriched-markdown";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
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

const defaultStyleState: StyleState = {
  bold: { isActive: false },
  italic: { isActive: false },
  underline: { isActive: false },
  strikethrough: { isActive: false },
  spoiler: { isActive: false },
  link: { isActive: false },
};

function resolveMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === "video") return "video/mp4";
  return "image/jpeg";
}

export function HavenComposer({ disabled, isSending, onSend }: HavenComposerProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [styleState, setStyleState] = useState<StyleState>(defaultStyleState);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState("https://");
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

  const runAfterNative = (fn: () => void) => {
    setTimeout(fn, 0);
  };

  const insertLinePrefix = useCallback(async (prefix: string) => {
    const inst = inputRef.current;
    if (!inst) return;
    const md = await inst.getMarkdown();
    const { start } = selection;
    const lineStart = md.lastIndexOf("\n", start - 1) + 1;
    const newText = `${md.substring(0, lineStart)}${prefix}${md.substring(lineStart)}`;
    inst.setValue(newText);
    setDraft(newText);
    const cursor = start + prefix.length;
    runAfterNative(() => {
      inst.setSelection(cursor, cursor);
      inst.focus();
    });
  }, [selection.start]);

  const openLinkModal = useCallback(() => {
    setLinkUrlDraft("https://");
    setLinkModalOpen(true);
  }, []);

  const submitLink = useCallback(() => {
    const u = linkUrlDraft.trim();
    if (!u) {
      setLinkModalOpen(false);
      return;
    }
    setLinkModalOpen(false);
    inputRef.current?.setLink(u);
    runAfterNative(() => inputRef.current?.focus());
  }, [linkUrlDraft]);

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
    setStyleState(defaultStyleState);
    setPendingAttachment(null);
  };

  const sendIconColor =
    draft.trim().length > 0 || pendingAttachment != null ? "#3F79D8" : "#4a5568";

  const showFormatBar = keyboardOpen && !disabled && !isSending;
  const chip = (active: boolean) => ({
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: active ? "rgba(63, 121, 216, 0.25)" : "rgba(30, 45, 69, 0.9)",
    borderWidth: 1,
    borderColor: active ? "rgba(63, 121, 216, 0.5)" : "rgba(80, 100, 128, 0.35)",
  });

  return (
    <View
      style={{
        backgroundColor: "#0F1728",
        paddingBottom: keyboardOpen ? 0 : insets.bottom || 0,
      }}
    >
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
          autoCorrect={false}
          spellCheck={false}
          defaultValue=""
          onChangeMarkdown={setDraft}
          onChangeSelection={setSelection}
          onChangeState={setStyleState}
          onFocus={() => setKeyboardOpen(true)}
          onBlur={() => {
            // Keyboard listener also clears; this covers hardware keyboard / edge cases
          }}
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

      {showFormatBar ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 10,
            backgroundColor: "#0F1728",
          }}
        >
          <Pressable
            onPress={() => {
              inputRef.current?.toggleBold();
              runAfterNative(() => inputRef.current?.focus());
            }}
            style={chip(styleState.bold.isActive)}
          >
            <Text style={{ color: "#e6edf7", fontWeight: "700", fontSize: 14 }}>B</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              inputRef.current?.toggleItalic();
              runAfterNative(() => inputRef.current?.focus());
            }}
            style={chip(styleState.italic.isActive)}
          >
            <Text style={{ color: "#e6edf7", fontStyle: "italic", fontSize: 14 }}>I</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              inputRef.current?.toggleUnderline();
              runAfterNative(() => inputRef.current?.focus());
            }}
            style={chip(styleState.underline.isActive)}
          >
            <Text
              style={{
                color: "#e6edf7",
                textDecorationLine: "underline",
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              U
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              inputRef.current?.toggleStrikethrough();
              runAfterNative(() => inputRef.current?.focus());
            }}
            style={chip(styleState.strikethrough.isActive)}
          >
            <Text style={{ color: "#e6edf7", textDecorationLine: "line-through", fontSize: 14 }}>
              S
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              inputRef.current?.toggleSpoiler();
              runAfterNative(() => inputRef.current?.focus());
            }}
            style={chip(styleState.spoiler.isActive)}
          >
            <Ionicons name="eye-off-outline" size={16} color="#e6edf7" />
          </Pressable>
          <Pressable onPress={() => void insertLinePrefix("> ")} style={chip(false)}>
            <Ionicons name="chatbox-ellipses-outline" size={16} color="#e6edf7" />
          </Pressable>
          <Pressable
            onPress={openLinkModal}
            style={chip(styleState.link.isActive)}
          >
            <Ionicons name="link-outline" size={16} color="#e6edf7" />
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={linkModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
          onPress={() => setLinkModalOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#1e2d45",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "#e6edf7", fontSize: 16, fontWeight: "600" }}>Link URL</Text>
            <TextInput
              value={linkUrlDraft}
              onChangeText={setLinkUrlDraft}
              placeholder="https://"
              placeholderTextColor="#6b7a90"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 8,
                backgroundColor: "#0F1728",
                color: "#e6edf7",
                fontSize: 15,
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 12 }}>
              <Pressable onPress={() => setLinkModalOpen(false)}>
                <Text style={{ color: "#a9b8cf", fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitLink}>
                <Text style={{ color: "#3F79D8", fontSize: 16, fontWeight: "600" }}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
