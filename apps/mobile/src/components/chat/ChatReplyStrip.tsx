import { Pressable, Text, View } from "react-native";

type ChatReplyStripProps = {
  label: string;
  onCancel: () => void;
};

export function ChatReplyStrip({ label, onCancel }: ChatReplyStripProps) {
  return (
    <View className="flex-row items-center justify-between border-t border-white/8 bg-surface-modal px-3 py-2">
      <Text className="mr-2.5 shrink text-xs text-foreground/80">{label}</Text>
      <Pressable hitSlop={8} onPress={onCancel}>
        <Text className="text-xs font-semibold text-primary">Cancel</Text>
      </Pressable>
    </View>
  );
}
