import { View, Text, Pressable } from "react-native";
import { useHavenCore, useVoiceSession } from "@mobile-data";
import { voiceControlMessage } from "@shared/features/voice/utils/memberControls";

export function VoiceControlNotice({
  floating = false,
}: {
  floating?: boolean;
}) {
  const core = useHavenCore();
  const { controlNotice } = useVoiceSession(core.voice);
  if (!controlNotice || controlNotice.action === "remove") return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className={
        floating
          ? "absolute bottom-6 left-4 right-4 rounded-xl border border-border bg-surface-panel p-4"
          : "rounded-xl border border-border bg-surface-panel p-4"
      }
    >
      <Text className="text-sm text-foreground">
        {voiceControlMessage(controlNotice)}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => core.voice.dismissControlNotice()}
        className="mt-2 min-h-11 justify-center"
      >
        <Text className="text-sm text-muted-foreground">Dismiss</Text>
      </Pressable>
    </View>
  );
}
