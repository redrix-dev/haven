import { requireHavenSolidCore } from "@solid-client/core";

export function VoiceSoundControls() {
  const { voice } = requireHavenSolidCore();
  return (
    <details class="mt-2 rounded border border-border px-2 py-1 text-xs text-foreground">
      <summary class="cursor-pointer py-1">Voice sound settings</summary>
      <label class="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={voice.state.soundSettings.enabled}
          onChange={(event) =>
            voice.updateSoundSettings({ enabled: event.currentTarget.checked })
          }
        />
        Voice confirmation sounds
      </label>
      <label class="my-3 block">
        Volume {voice.state.soundSettings.volume}%
        <input
          class="mt-2 w-full accent-primary"
          type="range"
          min="0"
          max="100"
          step="1"
          value={voice.state.soundSettings.volume}
          onInput={(event) =>
            voice.updateSoundSettings({
              volume: event.currentTarget.valueAsNumber,
            })
          }
        />
      </label>
      <p class="mb-2 text-muted-foreground">Uses your voice output device.</p>
    </details>
  );
}
