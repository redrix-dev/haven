import { NativeModules } from "react-native";
import { Asset } from "expo-asset";
import {
  playVoiceSound,
  type VoiceSoundEvent,
  type VoiceSoundSettings,
} from "@shared/features/voice/utils/voiceSounds";

const sources: Record<VoiceSoundEvent, number> = {
  join: require("@shared/assets/audio/voice/haven-connected.mp3"),
  leave: require("@shared/assets/audio/voice/haven-disconnected.mp3"),
  mute: require("@shared/assets/audio/voice/haven-muted.wav"),
  unmute: require("@shared/assets/audio/voice/haven-unmuted.wav"),
  deafen: require("@shared/assets/audio/voice/haven-deafened.wav"),
  undeafen: require("@shared/assets/audio/voice/haven-undeafened.wav"),
};

export function playMobileVoiceSound(
  event: VoiceSoundEvent,
  settings: VoiceSoundSettings,
): Promise<boolean> {
  return playVoiceSound(event, settings, async (action, volume) => {
    const native = NativeModules.HavenVoiceSounds as
      | { play: (uri: string, volume: number) => Promise<void> }
      | undefined;
    if (!native) throw new Error("Voice sounds need a native rebuild.");
    const asset = await Asset.fromModule(sources[action]).downloadAsync();
    await native.play(asset.localUri ?? asset.uri, volume);
  });
}
