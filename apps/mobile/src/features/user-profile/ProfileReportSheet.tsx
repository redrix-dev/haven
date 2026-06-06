import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

type ProfileReportSheetProps = {
  visible: boolean;
  username: string;
  destinationLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ProfileReportSheet({
  visible,
  username,
  destinationLabel,
  onClose,
  onSubmit,
}: ProfileReportSheetProps) {
  const themeTokens = useMobileThemeTokens();
  const placeholderColor =
    resolveColorProp(themeTokens, "muted-foreground") ?? "#8b9cbb";
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setReason("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    const normalized = reason.trim();
    if (!normalized) {
      setError("Report reason is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(normalized);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal scrim overlay, invariant across themes */}
      <Pressable className="flex-1 justify-center bg-black/60 px-4" onPress={onClose}>
        <Pressable
          className="max-h-[90%] rounded-2xl border border-border-panel bg-card p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-foreground">Report profile</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Reports go to {destinationLabel}. A profile snapshot is included for review.
          </Text>

          <ScrollView className="mt-4" keyboardShouldPersistTaps="handled">
            <View className="mb-4 rounded-xl border border-border-panel bg-surface-panel p-3">
              <Text className="text-xs uppercase text-muted-foreground">Reported user</Text>
              <Text className="mt-1 font-semibold text-foreground">{username}</Text>
            </View>

            <Text className="mb-2 text-xs uppercase text-muted-foreground">Reason *</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Describe why this profile should be reviewed."
              placeholderTextColor={placeholderColor}
              multiline
              maxLength={1000}
              className="min-h-24 rounded-xl border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
            />
            {error ? <Text className="mt-2 text-sm text-destructive">{error}</Text> : null}
          </ScrollView>

          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable onPress={onClose} disabled={submitting}>
              <Text className="py-2 text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              className={`rounded-xl bg-primary px-5 py-2.5 ${submitting ? "opacity-50" : ""}`}
            >
              <Text className="font-semibold text-primary-foreground">
                {submitting ? "Submitting…" : "Submit"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
