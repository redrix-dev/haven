import { View, Text, Switch, Pressable } from "react-native";
import { useHavenCore } from "@mobile-data";
import { useVoiceSession } from "@mobile-data/hooks";
import { ThemedIonicons } from "@/theme-rn";

export function VoiceSoundControls() {
  const core = useHavenCore();
  const { soundSettings } = useVoiceSession(core.voice);
  return (
    <View className="gap-3 rounded-lg bg-surface-panel p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">
            Voice sounds
          </Text>
          <Text className="text-xs text-muted-foreground">
            Join, leave, mute and deafen
          </Text>
        </View>
        <Switch
          accessibilityLabel="Voice confirmation sounds"
          value={soundSettings.enabled}
          onValueChange={(enabled) =>
            core.voice.updateSoundSettings({ enabled })
          }
        />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease voice sound volume"
          className="h-11 w-11 items-center justify-center rounded-lg bg-surface-embedded"
          onPress={() =>
            core.voice.updateSoundSettings({ volume: soundSettings.volume - 5 })
          }
        >
          <ThemedIonicons
            name="remove"
            size={18}
            colorClassName="accent-foreground"
          />
        </Pressable>
        <Text className="text-sm text-foreground">
          Volume {soundSettings.volume}%
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase voice sound volume"
          className="h-11 w-11 items-center justify-center rounded-lg bg-surface-embedded"
          onPress={() =>
            core.voice.updateSoundSettings({ volume: soundSettings.volume + 5 })
          }
        >
          <ThemedIonicons
            name="add"
            size={18}
            colorClassName="accent-foreground"
          />
        </Pressable>
      </View>
      <Text className="text-xs text-muted-foreground">
        Plays through your voice audio output.
      </Text>
    </View>
  );
}
