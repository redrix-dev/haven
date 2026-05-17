import { Modal, Pressable, Text, View } from "react-native";

type DmMessageActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Peer display name for context (optional). */
  peerLabel?: string;
  onReport: () => void;
};

/**
 * Bottom sheet for DM message long-press: Report (Haven-only flow via `DmReportSheet`) + Cancel.
 */
export function DmMessageActionsSheet({
  visible,
  onClose,
  peerLabel,
  onReport,
}: DmMessageActionsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/55" onPress={onClose}>
        <Pressable
          className="rounded-t-2xl border-t border-border bg-surface-modal px-4 pb-8 pt-3"
          onPress={(e) => e.stopPropagation()}
        >
          {peerLabel ? (
            <Text className="mb-3 text-center text-xs text-muted-foreground" numberOfLines={2}>
              {peerLabel}
            </Text>
          ) : (
            <Text className="mb-3 text-center text-xs text-muted-foreground">Direct message</Text>
          )}
          <Pressable
            className="mb-2 rounded-xl bg-surface-panel py-3.5 active:opacity-90"
            onPress={() => {
              onReport();
              onClose();
            }}
          >
            <Text className="text-center text-base font-medium text-foreground">Report</Text>
          </Pressable>
          <Pressable className="mt-1 rounded-xl py-3 active:opacity-90" onPress={onClose}>
            <Text className="text-center text-base text-muted-foreground">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
