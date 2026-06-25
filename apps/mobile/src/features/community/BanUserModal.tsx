import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

type BanUserModalProps = {
  visible: boolean;
  username: string;
  onDismiss: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function BanUserModal({
  visible,
  username,
  onDismiss,
  onConfirm,
}: BanUserModalProps) {
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
    const r = reason.trim();
    if (!r) {
      setError("Reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(r);
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban user.");
    } finally {
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
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - full-screen modal scrim, intentionally darker (60%) than standard 50% */}
      <Pressable
        className="flex-1 justify-center bg-black/60 px-4"
        onPress={onDismiss}
      >
        <Pressable
          className="rounded-2xl bg-card border border-border-panel p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-foreground">
            Ban user
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Bans remove community access until revoked. Target:{" "}
            <Text className="font-semibold text-foreground">{username}</Text>
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (required)"
            placeholderTextColor={placeholderColor}
            multiline
            maxLength={1000}
            className="mt-4 min-h-25 rounded-xl border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground"
          />
          {error ? (
            <Text className="mt-2 text-sm text-destructive">{error}</Text>
          ) : null}
          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable onPress={onDismiss} disabled={submitting}>
              <Text className="py-2 text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              className="rounded-xl bg-destructive px-5 py-2.5"
            >
              <Text className="font-semibold text-destructive-foreground">
                {submitting ? "Banning…" : "Ban user"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
