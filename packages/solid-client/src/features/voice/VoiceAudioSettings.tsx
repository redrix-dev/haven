import { Show, For, createSignal } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { Button } from "@solid-client/components/ui";
import { createVoicePushToTalkBindingFromKeyboardEvent } from "@shared/features/voice/utils/pushToTalk";
import type { VoiceTransmissionMode } from "@shared/types/settings";
import { VoiceSoundControls } from "./VoiceSoundControls";
import "./voiceSensitivity.css";

export function VoiceAudioSettings() {
  const core = requireHavenSolidCore();
  const controller = useVoice();
  const { voice, switchInputDevice, setOutputDevice } = controller;
  const settings = () => core.voice.state.settings;
  const [recording, setRecording] = createSignal(false);
  return (
    <div class="space-y-5">
      <Show when={voice.error}>
        <p role="alert" class="text-sm text-destructive">
          {voice.error}
        </p>
      </Show>
      <label class="block text-sm">
        Microphone
        <select
          class="mt-2 w-full rounded border border-border bg-surface-panel p-2 text-sm"
          value={voice.selectedInputDeviceId}
          onChange={(event) =>
            void switchInputDevice(event.currentTarget.value)
          }
        >
          <option value="default">System default</option>
          <For
            each={voice.inputDevices.filter(
              (item) => item.deviceId !== "default",
            )}
          >
            {(item) => <option value={item.deviceId}>{item.label}</option>}
          </For>
        </select>
      </label>
      <label class="block text-sm">
        Audio output
        <select
          class="mt-2 w-full rounded border border-border bg-surface-panel p-2 text-sm disabled:opacity-50"
          disabled={!voice.supportsOutputSelection}
          value={voice.selectedOutputDeviceId}
          onChange={(event) => void setOutputDevice(event.currentTarget.value)}
        >
          <option value="default">System default</option>
          <For
            each={voice.outputDevices.filter(
              (item) => item.deviceId !== "default",
            )}
          >
            {(item) => <option value={item.deviceId}>{item.label}</option>}
          </For>
        </select>
      </label>
      <Show when={!voice.supportsOutputSelection}>
        <p class="text-xs text-muted-foreground">
          Your system controls the audio output.
        </p>
      </Show>
      <Show when={controller.supportsTransmissionModes}>
        <label class="block text-sm">
          Transmission mode
          <select
            class="mt-2 w-full rounded border border-border bg-surface-panel p-2 text-sm"
            value={settings().transmissionMode}
            onChange={(event) =>
              core.voice.updateSettings({
                transmissionMode: event.currentTarget
                  .value as VoiceTransmissionMode,
              })
            }
          >
            <option value="voice_activity">Voice activity</option>
            <option value="open_mic">Open mic</option>
            <option value="push_to_talk">Push to talk</option>
          </select>
        </label>
        <Show when={settings().transmissionMode === "voice_activity"}>
          <div>
            <label for="voice-threshold" class="flex justify-between text-sm">
              <span>Voice sensitivity</span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {settings().voiceActivationThreshold}%
              </span>
            </label>
            <div class="relative my-3 flex h-11 items-center px-1">
              <div class="h-4 w-full rounded bg-surface-embedded">
                <div
                  class="h-full rounded bg-accent-success/70"
                  style={{
                    width: `${Math.round(voice.localInputLevel * 100)}%`,
                  }}
                />
              </div>
              <input
                id="voice-threshold"
                aria-label="Voice activation threshold"
                class="voice-threshold-slider absolute inset-0 h-11 w-full"
                type="range"
                min="0"
                max="100"
                value={settings().voiceActivationThreshold}
                onInput={(event) =>
                  core.voice.updateSettings({
                    voiceActivationThreshold: event.currentTarget.valueAsNumber,
                  })
                }
              />
            </div>
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>
                {voice.voiceActivityGateOpen
                  ? "Transmitting"
                  : "Below threshold"}
              </span>
              <span>Input {Math.round(voice.localInputLevel * 100)}%</span>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Drag the marker just above your background noise.
            </p>
          </div>
        </Show>
        <Show when={settings().transmissionMode === "push_to_talk"}>
          <div class="text-sm">
            <span class="mb-2 block">Push-to-talk shortcut</span>
            <Button
              variant="ghost"
              class="border border-border"
              onClick={() => setRecording(true)}
              onKeyDown={(event) => {
                if (!recording()) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") {
                  setRecording(false);
                  return;
                }
                if (["Control", "Alt", "Shift", "Meta"].includes(event.key))
                  return;
                const binding =
                  createVoicePushToTalkBindingFromKeyboardEvent(event);
                if (binding) {
                  core.voice.updateSettings({ pushToTalkBinding: binding });
                  setRecording(false);
                }
              }}
            >
              {recording()
                ? "Press a key…"
                : (settings().pushToTalkBinding?.label ?? "Set shortcut")}
            </Button>
            <p class="mt-2 text-xs text-muted-foreground">
              Works while Haven has focus. Escape cancels recording.
            </p>
          </div>
        </Show>
      </Show>
      <VoiceSoundControls />
    </div>
  );
}
