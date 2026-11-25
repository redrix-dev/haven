import { Modal, Pressable, Text, View } from "react-native";

export type MessageActionTarget = {
  messageId: string;
  authorUserId: string | null;
  authorName: string;
};

type MessageActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  target: MessageActionTarget | null;
  communityName: string;
  canReply: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  /** Emoji offered as one-tap reactions. Tapping one you used takes it back. */
  quickReactions: readonly string[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
};

/** What can be done to one message, from a long press. */
export function MessageActionsSheet({
  visible,
  onClose,
  target,
  communityName,
  canReply,
  canCopy,
  canEdit,
  canDelete,
  canReport,
  quickReactions,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onReport,
}: MessageActionsSheetProps) {
  if (!target) return null;

  const row = (
    label: string,
    onPress: () => void,
    tone: "default" | "destructive" = "default",
  ) => (
    <Pressable
      className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
      onPress={() => {
        onPress();
        onClose();
      }}
    >
      <Text
        className={`text-center text-base font-medium ${
          tone === "destructive" ? "text-destructive" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal sheet scrim overlay, invariant across themes */}
      <Pressable className="flex-1 justify-end bg-black/55" onPress={onClose}>
        <Pressable
          className="rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-8 pt-3"
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            className="mb-3 text-center text-xs text-muted-foreground"
            numberOfLines={2}
          >
            {communityName}
          </Text>
          <View className="mb-3 flex-row justify-between">
            {quickReactions.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                className="h-11 w-11 items-center justify-center rounded-full bg-surface-panel active:opacity-80"
                onPress={() => {
                  onReact(emoji);
                  onClose();
                }}
              >
                <Text className="text-xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {canReply ? row("Reply", onReply) : null}
          {canCopy ? row("Copy text", onCopy) : null}
          {canEdit ? row("Edit", onEdit) : null}
          {canDelete ? row("Delete", onDelete, "destructive") : null}
          {canReport ? row("Report", onReport) : null}
          <Pressable
            className="mt-1 rounded-xl py-3 active:opacity-90"
            onPress={onClose}
          >
            <Text className="text-center text-base text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
