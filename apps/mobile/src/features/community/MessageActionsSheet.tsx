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
  canReport: boolean;
  canKick: boolean;
  canBan: boolean;
  onReply: () => void;
  onReport: () => void;
  onKick: () => void;
  onBan: () => void;
};

export function MessageActionsSheet({
  visible,
  onClose,
  target,
  communityName,
  canReport,
  canKick,
  canBan,
  onReply,
  onReport,
  onKick,
  onBan,
}: MessageActionsSheetProps) {
  if (!target) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal sheet scrim overlay, invariant across themes */}
      <Pressable className="flex-1 justify-end bg-black/55" onPress={onClose}>
        <Pressable
          className="rounded-t-2xl border-t border-border-panel bg-surface-modal px-4 pb-8 pt-3"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="mb-3 text-center text-xs text-muted-foreground" numberOfLines={2}>
            {communityName}
          </Text>
          <Pressable
            className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
            onPress={() => {
              onReply();
              onClose();
            }}
          >
            <Text className="text-center text-base font-medium text-foreground">Reply</Text>
          </Pressable>
          {canReport ? (
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={() => {
                onReport();
                onClose();
              }}
            >
              <Text className="text-center text-base font-medium text-foreground">Report</Text>
            </Pressable>
          ) : null}
          {canKick ? (
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={() => {
                onKick();
                onClose();
              }}
            >
              <Text className="text-center text-base font-medium text-orange-400">
                Kick from community
              </Text>
            </Pressable>
          ) : null}
          {canBan ? (
            <Pressable
              className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
              onPress={() => {
                onBan();
                onClose();
              }}
            >
              <Text className="text-center text-base font-medium text-destructive">Ban user</Text>
            </Pressable>
          ) : null}
          <Pressable className="mt-1 rounded-xl py-3 active:opacity-90" onPress={onClose}>
            <Text className="text-center text-base text-muted-foreground">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
