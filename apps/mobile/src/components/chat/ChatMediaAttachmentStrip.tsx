import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type ChatMediaAttachmentStripProps = {
  fileName: string;
  iconColor: string;
  disabled?: boolean;
  onRemove: () => void;
};

export function ChatMediaAttachmentStrip({
  fileName,
  iconColor,
  disabled,
  onRemove,
}: ChatMediaAttachmentStripProps) {
  return (
    <View className="flex-row items-center gap-2 border-t border-white/8 bg-surface-modal/90 px-3 py-2">
      <Ionicons name="attach" size={16} color={iconColor} />
      <Text className="min-w-0 flex-1 text-xs text-foreground/90" numberOfLines={1}>
        {fileName}
      </Text>
      <Pressable hitSlop={8} disabled={disabled} onPress={onRemove} className="shrink-0">
        <Text className="text-xs font-semibold text-primary">Remove</Text>
      </Pressable>
    </View>
  );
}
