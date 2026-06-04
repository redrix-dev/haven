import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { resolveColorProp } from "@shared/themes";

const HOLD_MS = 10_000;

type DeleteAccountConfirmationModalProps = {
  visible: boolean;
  onDismiss: () => void;
  onConfirmDelete: () => Promise<void>;
  isDeleting: boolean;
};

export default function DeleteAccountConfirmationModal({
  visible,
  onDismiss,
  onConfirmDelete,
  isDeleting,
}: DeleteAccountConfirmationModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const themeTokens = useMobileThemeTokens();
  const destructiveColor = resolveColorProp(themeTokens, "destructive") ?? "#ef4444";

  const [isPressing, setIsPressing] = useState(false);
  /** 0–1 while holding */
  const [holdProgress, setHoldProgress] = useState(0);
  /** Whole seconds shown in the headline (10 → 0 while completing hold) */
  const [secondsRemaining, setSecondsRemaining] = useState(10);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);
  const firedRef = useRef(false);

  const clearHoldTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    holdStartRef.current = 0;
    firedRef.current = false;
    setIsPressing(false);
    setHoldProgress(0);
    setSecondsRemaining(10);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearHoldTimers();
    }
  }, [visible, clearHoldTimers]);

  const endHoldAndDelete = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setIsPressing(false);
    setHoldProgress(1);
    setSecondsRemaining(0);
    await onConfirmDelete();
  }, [onConfirmDelete]);

  const onHoldIn = useCallback(() => {
    if (isDeleting) return;
    firedRef.current = false;
    setIsPressing(true);
    holdStartRef.current = Date.now();

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const p = Math.min(1, elapsed / HOLD_MS);
      setHoldProgress(p);
      setSecondsRemaining(Math.max(0, Math.ceil(10 * (1 - p))));

      if (elapsed >= HOLD_MS && !firedRef.current) {
        firedRef.current = true;
        void endHoldAndDelete();
      }
    }, 50);
  }, [endHoldAndDelete, isDeleting]);

  const onHoldOut = useCallback(() => {
    if (isDeleting || firedRef.current) return;
    clearHoldTimers();
  }, [clearHoldTimers, isDeleting]);

  const countdownHeadline =
    secondsRemaining > 0
      ? `Account will be permanently deleted in ${secondsRemaining}…`
      : "Finishing…";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDeleting ? undefined : onDismiss}
    >
      {/* uniwind-theme-allow mobile-theme/no-raw-palette-class - full-screen modal scrim overlay, invariant across themes */}
      <Pressable className="flex-1 justify-end bg-black/60" onPress={isDeleting ? undefined : onDismiss} accessibilityLabel="Dismiss delete account dialog backdrop">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-surface-modal px-5 pt-4"
          style={{
            paddingBottom: Math.max(insets.bottom, 20),
            maxHeight: windowHeight * 0.92,
          }}
        >
          <View className="w-10 self-center h-1 rounded-full bg-surface-embedded mb-4" />

          <Text className="text-center text-lg font-semibold text-destructive mb-2">
            {isDeleting ? "Deleting your account…" : countdownHeadline}
          </Text>

          {!isDeleting ? (
            <View className="h-1.5 w-full rounded-full bg-surface-embedded overflow-hidden mb-5">
              <View
                className="h-full rounded-full bg-destructive"
                style={{
                  width: `${Math.round(holdProgress * 100)}%`,
                  opacity: isPressing ? 1 : 0.45,
                }}
              />
            </View>
          ) : (
            <View className="mb-5 items-center">
              <ActivityIndicator color={destructiveColor} size="small" />
            </View>
          )}

          {!isDeleting ? (
            <>
              <Text className="text-[15px] leading-[22px] text-foreground mb-2">
                This is irreversible. Your account and its data as they exist now cannot be
                recovered.
              </Text>
              <Text className="text-[15px] leading-[22px] text-muted-foreground mb-6">
                Press and hold the button below for ten seconds to permanently delete your account,
                or tap Cancel to go back.
              </Text>
            </>
          ) : null}

          {isDeleting ? (
            <View className="py-4 items-center">
              <Text className="text-muted-foreground text-sm text-center">
                Please wait while we remove your profile and sign you out.
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                onPressIn={onHoldIn}
                onPressOut={onHoldOut}
                accessibilityRole="button"
                accessibilityLabel="Hold to permanently delete account"
                accessibilityHint="Hold for ten seconds to confirm permanent account deletion"
                className="rounded-xl border-2 border-destructive bg-destructive/10 py-4 px-4 mb-3 active:opacity-90"
              >
                <Text className="text-center text-base font-semibold text-destructive">
                  {isPressing ? "Keep holding…" : "Yes — permanently delete my account"}
                </Text>
                <Text className="text-center text-xs text-destructive/80 mt-2">
                  Hold continuously for 10 seconds
                </Text>
              </Pressable>

              <Pressable
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Cancel and keep account"
                className="rounded-xl bg-surface-panel py-3.5 mb-1 active:bg-surface-hover"
              >
                <Text className="text-center text-base font-medium text-primary">Cancel</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
