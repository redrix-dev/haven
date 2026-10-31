import join from "@shared/assets/audio/voice/haven-connected.mp3";
import leave from "@shared/assets/audio/voice/haven-disconnected.mp3";
import mute from "@shared/assets/audio/voice/haven-muted.wav";
import unmute from "@shared/assets/audio/voice/haven-unmuted.wav";
import deafen from "@shared/assets/audio/voice/haven-deafened.wav";
import undeafen from "@shared/assets/audio/voice/haven-undeafened.wav";
import {
  playVoiceSound,
  type VoiceSoundEvent,
  type VoiceSoundSettings,
} from "@shared/features/voice/utils/voiceSounds";

const sources = { join, leave, mute, unmute, deafen, undeafen };

/** Each invocation owns its player: rapid opposing actions never cancel each other. */
export function playWebVoiceSound(
  event: VoiceSoundEvent,
  settings: VoiceSoundSettings,
  outputDeviceId: string,
): Promise<boolean> {
  return playVoiceSound(event, settings, async (action, volume) => {
    const audio = new Audio(sources[action]);
    audio.volume = volume;
    if (outputDeviceId && outputDeviceId !== "default") {
      if (!("setSinkId" in audio))
        throw new Error(
          "This browser cannot route confirmation sounds to the selected output.",
        );
      await (
        audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
      ).setSinkId(outputDeviceId);
    }
    await audio.play();
  });
}
