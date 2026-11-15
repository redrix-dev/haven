import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { resolveColorProp } from "@shared/themes";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

/**
 * Who a report goes to. A report goes to one: the community's moderators,
 * or Haven staff (who also handle anything outside a community).
 */
export type ReportTarget = "community" | "haven";

export type ReportResult = {
  target: ReportTarget;
  /** Empty when the person gave none and none was required. */
  reason: string;
};

const TARGET_OPTIONS: { value: ReportTarget; label: string }[] = [
  { value: "community", label: "Community moderators" },
  { value: "haven", label: "Haven staff" },
];

/**
 * The report sheet for messages and people. Presentational: `onSubmit` files
 * the report (features/people/PeopleProvider).
 *
 * - `showTarget`: in a community the person picks who it goes to; anywhere
 *   else it goes to Haven staff.
 * - `reasonRequired`: a community can ask for a reason
 *   (`report_reason_required`); the database refuses one without it.
 */
export function ReportSheet({
  visible,
  title,
  subjectPreview,
  showTarget,
  reasonRequired,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  subjectPreview?: string;
  showTarget: boolean;
  reasonRequired: boolean;
  onDismiss: () => void;
  onSubmit: (result: ReportResult) => Promise<void>;
}) {
  const themeTokens = useMobileThemeTokens();
  const placeholderColor =
    resolveColorProp(themeTokens, "muted-foreground") ?? "#8b9cbb";
  const [target, setTarget] = useState<ReportTarget>("community");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setTarget("community");
      setReason("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const sendsTo: ReportTarget = showTarget ? target : "haven";
  const needsReason = sendsTo === "community" && reasonRequired;

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed && needsReason) {
      setError("This community asks for a reason with every report.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ target: sendsTo, reason: trimmed });
    } catch (e) {
      setError(getErrorMessage(e, "Failed to submit report."));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - modal scrim overlay, invariant across themes */}
      <Pressable
        className="flex-1 justify-center bg-black/60 px-4"
        onPress={onDismiss}
      >
        <Pressable
          className="max-h-[88%] rounded-2xl border border-border-panel bg-card p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-foreground">{title}</Text>
          {subjectPreview ? (
            <Text
              className="mt-2 rounded-xl bg-surface-panel px-3 py-2 text-sm text-muted-foreground"
              numberOfLines={3}
            >
              {subjectPreview}
            </Text>
          ) : null}

          <ScrollView className="mt-4" keyboardShouldPersistTaps="handled">
            {showTarget ? (
              <>
                <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Send to
                </Text>
                {TARGET_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: target === opt.value }}
                    className={`mb-2 rounded-xl border px-3 py-3 ${
                      target === opt.value
                        ? "border-primary bg-surface-panel"
                        : "border-border-control"
                    }`}
                    onPress={() => setTarget(opt.value)}
                  >
                    <Text className="text-sm text-foreground">{opt.label}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text className="mb-2 text-sm text-muted-foreground">
                This goes to Haven staff.
              </Text>
            )}

            <Text className="mb-2 mt-2 text-xs font-semibold uppercase text-muted-foreground">
              {needsReason ? "Reason (required)" : "Reason (optional)"}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="What happened?"
              placeholderTextColor={placeholderColor}
              multiline
              maxLength={1000}
              className="min-h-22 rounded-xl border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
            />
            {error ? (
              <Text className="mt-2 text-sm text-destructive">{error}</Text>
            ) : null}
          </ScrollView>

          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable
              onPress={onDismiss}
              disabled={submitting}
              className="py-2"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              className={`rounded-xl bg-primary px-5 py-2.5 ${submitting ? "opacity-50" : ""}`}
            >
              <Text className="font-semibold text-primary-foreground">
                {submitting ? "Sending…" : "Send report"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
