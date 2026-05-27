import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MessageReportKind, MessageReportTarget } from "@shared/lib/backend/types";

type CommunityReportMessageModalProps = {
  visible: boolean;
  onDismiss: () => void;
  communityName: string;
  onSubmit: (input: {
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) => Promise<void>;
};

const TARGET_OPTIONS: { value: MessageReportTarget; label: string }[] = [
  { value: "haven_staff", label: "Haven Moderation Team" },
  { value: "server_admins", label: "Community moderation team" },
  { value: "both", label: "Both" },
];

const KIND_OPTIONS: { value: MessageReportKind; label: string }[] = [
  { value: "content_abuse", label: "Content abuse" },
  { value: "bug", label: "Bug / platform issue" },
];

export function CommunityReportMessageModal({
  visible,
  onDismiss,
  communityName,
  onSubmit,
}: CommunityReportMessageModalProps) {
  const [target, setTarget] = useState<MessageReportTarget>("server_admins");
  const [kind, setKind] = useState<MessageReportKind>("content_abuse");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setTarget("server_admins");
      setKind("content_abuse");
      setComment("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ target, kind, comment: comment.trim() });
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal scrim overlay, invariant across themes */}
      <Pressable className="flex-1 justify-center bg-black/60 px-4" onPress={onDismiss}>
        <Pressable
          className="max-h-[88%] rounded-2xl bg-card border border-border p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-foreground">Report message</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Route this report to {communityName} staff, Haven, or both. A snapshot of the message
            context is included for reviewers.
          </Text>

          <ScrollView className="mt-4" keyboardShouldPersistTaps="handled">
            <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Destination
            </Text>
            {TARGET_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                className={`mb-2 rounded-xl border px-3 py-3 ${
                  target === opt.value ? "border-primary bg-surface-panel" : "border-border"
                }`}
                onPress={() => setTarget(opt.value)}
              >
                <Text className="text-sm text-foreground">{opt.label}</Text>
              </Pressable>
            ))}

            <Text className="mb-2 mt-3 text-xs font-semibold uppercase text-muted-foreground">
              Type
            </Text>
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

            <Text className="mb-2 mt-2 text-xs font-semibold uppercase text-muted-foreground">
              Comment (optional, max 1000)
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add context for moderators"
              // uniwind-theme-allow mobile-theme/no-raw-color-prop - TextInput placeholderTextColor requires raw value; matches muted-foreground
              placeholderTextColor="#8e8e93"
              multiline
              maxLength={1000}
              className="min-h-22 rounded-xl border border-border bg-surface-panel px-3 py-2 text-sm text-foreground"
            />
            {error ? <Text className="mt-2 text-sm text-destructive">{error}</Text> : null}
          </ScrollView>

          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable onPress={onDismiss} disabled={submitting} className="py-2">
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              className={`rounded-xl bg-primary px-5 py-2.5 ${submitting ? "opacity-50" : ""}`}
            >
              <Text className="font-semibold text-primary-foreground">
                {submitting ? "Submitting…" : "Submit report"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
