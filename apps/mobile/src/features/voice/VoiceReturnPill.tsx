import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedIonicons } from "@/theme-rn";
import type { MobileVoiceControllerState } from "@/features/voice/useMobileLiveKitVoiceSession";

type VoiceReturnPillProps = {
  state: MobileVoiceControllerState;
  onPress: () => void;
};

export function VoiceReturnPill({ state, onPress }: VoiceReturnPillProps) {
  const insets = useSafeAreaInsets();
  if (!state.activeChannel || (!state.joined && !state.joining)) return null;

  const participantCount = state.participants.length + (state.joined ? 1 : 0);
  const status = state.joining
    ? "Connecting"
    : state.isDeafened
      ? "Deafened"
      : state.isMuted
        ? "Muted"
        : "Connected";

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-4 right-4"
      style={{ bottom: Math.max(insets.bottom, 12) + 8 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to voice session"
        onPress={onPress}
        className="flex-row items-center gap-3 rounded-2xl border border-border-panel bg-surface-modal px-4 py-3 shadow-lg active:bg-surface-hover"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
          <ThemedIonicons
            name="volume-high-outline"
            size={20}
            colorClassName="accent-foreground"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-semibold text-foreground"
            numberOfLines={1}
          >
            {state.activeChannel.channelName}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {status} - {participantCount} in voice
          </Text>
        </View>
        <ThemedIonicons
          name="chevron-up"
          size={18}
          colorClassName="accent-text-dim"
        />
      </Pressable>
    </View>
  );
}
