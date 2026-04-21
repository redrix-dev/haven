import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Pressable, Text, View } from "react-native";
import { HavenInput } from "../HavenInput";

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
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);

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

  return (
    <View className="border-t border-border-panel bg-surface-modal px-3 pb-3 pt-2">
      <View className="mb-2 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          className={`h-9 w-9 items-center justify-center rounded-lg ${
            disabled ? "bg-surface-embedded/70" : "bg-surface-panel active:bg-surface-hover"
          }`}
          disabled={disabled || isSending}
          onPress={() => void handleAttach()}
        >
          <Ionicons name="attach" size={18} color="#e6edf7" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className={`h-9 w-9 items-center justify-center rounded-lg ${
            disabled ? "bg-surface-embedded/70" : "bg-surface-panel active:bg-surface-hover"
          }`}
          disabled={disabled || isSending}
          onPress={() => undefined}
        >
          <Ionicons name="text" size={18} color="#e6edf7" />
        </Pressable>
        <Text className="text-xs text-muted-foreground">
          {pendingAttachment
            ? `Attached: ${pendingAttachment.fileName}`
            : "Formatting and media enabled"}
        </Text>
        <Pressable
          accessibilityRole="button"
          className={`ml-auto rounded-lg px-3 py-2 ${
            disabled || isSending
              ? "bg-surface-embedded/70"
              : "bg-primary active:bg-link-soft"
          }`}
          disabled={disabled || isSending}
          onPress={() => void handleSend()}
        >
          <Text className="text-xs font-semibold text-foreground">
            {isSending ? "Sending..." : "Send"}
          </Text>
        </Pressable>
      </View>

      <HavenInput
        value={draft}
        onChangeText={setDraft}
        editable={!disabled && !isSending}
        placeholder={disabled ? "Select a text channel to start chatting" : "Message channel"}
      />
    </View>
  );
}
