import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { DirectMessageReportKind } from "@shared/lib/backend/types";

type DmReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  authorUsername: string;
  messagePreview: string;
  onSubmit: (input: { kind: DirectMessageReportKind; comment: string }) => Promise<void>;
};

const KIND_OPTIONS: { value: DirectMessageReportKind; label: string }[] = [
  { value: "content_abuse", label: "Content abuse" },
  { value: "bug", label: "Bug / platform issue" },
];

export function DmReportSheet({
  visible,
  onClose,
  authorUsername,
  messagePreview,
  onSubmit,
}: DmReportSheetProps) {
  const [kind, setKind] = useState<DirectMessageReportKind>("content_abuse");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setKind("content_abuse");
      setComment("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    const c = comment.trim();
    if (!c) {
      setError("Please add a brief reason for this report.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ kind, comment: c });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-4" onPress={onClose}>
        <Pressable
          className="max-h-[90%] rounded-2xl bg-card border border-border p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-foreground">Report direct message</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Reports go to the Haven Moderation Team only. Direct messages are moderated by Haven, not community owners.
          </Text>

          <ScrollView className="mt-4" keyboardShouldPersistTaps="handled">
            <View className="mb-4 rounded-xl border border-border bg-surface-panel p-3">
              <Text className="text-[10px] uppercase text-muted-foreground">Reported user</Text>
              <Text className="mt-1 font-semibold text-foreground">{authorUsername}</Text>
              <Text className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{messagePreview}</Text>
            </View>

            <Text className="mb-2 text-xs uppercase text-muted-foreground">Type</Text>
            {KIND_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                className={`mb-2 rounded-xl border px-3 py-3 ${
                  kind === opt.value ? "border-primary bg-surface-panel" : "border-border"
                }`}
                onPress={() => setKind(opt.value)}
              >
                <Text className="text-sm text-foreground">{opt.label}</Text>
              </Pressable>
            ))}

            <Text className="mb-2 mt-2 text-xs uppercase text-muted-foreground">Comment *</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Describe what happened"
              placeholderTextColor="#8e8e93"
              multiline
              className="min-h-[96px] rounded-xl border border-border bg-surface-panel px-3 py-2 text-sm text-foreground"
            />
            {error ? <Text className="mt-2 text-sm text-red-400">{error}</Text> : null}
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
              <Text className="font-semibold text-white">{submitting ? "Submitting…" : "Submit"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
