import { Pressable, Text, View } from "react-native";
import { ThemedIonicons } from "@/theme-rn";

type ChatMediaAttachmentStripProps = {
  fileName: string;
  disabled?: boolean;
  onRemove: () => void;
};

export function ChatMediaAttachmentStrip({
  fileName,
  disabled,
  onRemove,
}: ChatMediaAttachmentStripProps) {
  return (
    <View className="flex-row items-center gap-2 border-t border-foreground/8 bg-surface-modal/90 px-3 py-2">
      <ThemedIonicons name="attach" size={16} colorClassName="accent-muted-foreground" />
      <Text className="min-w-0 flex-1 text-xs text-foreground/90" numberOfLines={1}>
        {fileName}
      </Text>
      <Pressable hitSlop={8} disabled={disabled} onPress={onRemove} className="shrink-0">
        <Text className="text-sm font-semibold text-primary">Remove</Text>
      </Pressable>
    </View>
  );
}
