import { afterEach, expect, it, vi } from "vitest";
import { playWebVoiceSound } from "./voiceSounds";
import {
  VoiceNexus,
  createInitialVoiceState,
} from "@shared/nexus/voice/voiceNexus";
import { createPlainStatePort } from "@shared/nexus/kit/statePort";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";

afterEach(() => vi.unstubAllGlobals());

it("routes every rapid action to the voice output with the persisted volume", async () => {
  const players: {
    src: string;
    volume: number;
    setSinkId: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "Audio",
    class {
      volume = 1;
      setSinkId = vi.fn(async () => {});
      play = vi.fn(async () => {});
      constructor(public src: string) {
        players.push(this);
      }
    },
  );
  const storage = createMemoryPersistence();
  const voice = new VoiceNexus(
    createPlainStatePort(createInitialVoiceState()),
    null,
    null,
    storage,
  );
  expect(voice.getSnapshot().soundSettings).toEqual({
    enabled: true,
    volume: 50,
  });
  voice.updateSoundSettings({ volume: 35 });
  const restored = new VoiceNexus(
    createPlainStatePort(createInitialVoiceState()),
    null,
    null,
    storage,
  );
  const settings = restored.getSnapshot().soundSettings;
  const results = await Promise.all(
    (["join", "leave", "mute", "unmute", "deafen", "undeafen"] as const).map(
      (event) => playWebVoiceSound(event, settings, "headset"),
    ),
  );
  expect(results).toEqual([true, true, true, true, true, true]);
  expect(players).toHaveLength(6);
  expect(new Set(players.map((p) => p.src)).size).toBe(6);
  for (const player of players) {
    expect(player.setSinkId).toHaveBeenCalledWith("headset");
    expect(player.volume).toBe(0.35);
    expect(player.play).toHaveBeenCalledOnce();
  }
});

it("persists off and zero-volume preferences and preserves them when clearing a session", async () => {
  const audio = vi.fn();
  vi.stubGlobal("Audio", audio);
  const storage = createMemoryPersistence();
  const voice = new VoiceNexus(
    createPlainStatePort(createInitialVoiceState()),
    null,
    null,
    storage,
  );
  voice.updateSoundSettings({ enabled: false });
  voice.clear();
  expect(voice.getSnapshot().soundSettings.enabled).toBe(false);
  const restored = new VoiceNexus(
    createPlainStatePort(createInitialVoiceState()),
    null,
    null,
    storage,
  );
  expect(
    await playWebVoiceSound(
      "mute",
      restored.getSnapshot().soundSettings,
      "default",
    ),
  ).toBe(false);
  expect(
    await playWebVoiceSound("unmute", { enabled: true, volume: 0 }, "default"),
  ).toBe(false);
  expect(audio).not.toHaveBeenCalled();
});
