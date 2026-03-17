// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_ASSET_PATHS } from "@shared/assets/manifest";
import type { NotificationAudioSettings } from "@platform/desktop/types";

const baseAudioSettings: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 70,
  voicePresenceSoundEnabled: true,
  voicePresenceSoundVolume: 55,
  playSoundsWhenFocused: true,
};

type MockAudioInstance = {
  src: string;
  volume: number;
  play: ReturnType<typeof vi.fn>;
};

let audioInstances: MockAudioInstance[] = [];

const loadSoundModule = async () => {
  vi.resetModules();
  return import("@shared/lib/notifications/sound");
};

describe("notification sound helpers", () => {
  beforeEach(() => {
    audioInstances = [];

    const audioConstructor = vi.fn(function (
      this: MockAudioInstance,
      src: string,
    ) {
      const instance: MockAudioInstance = {
        src,
        volume: 1,
        play: vi.fn().mockResolvedValue(undefined),
      };
      audioInstances.push(instance);
      return instance as unknown as MockAudioInstance;
    });

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: audioConstructor,
    });

    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: vi.fn(() => true),
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("plays notification sounds through the default notification asset", async () => {
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    const { playNotificationSound } = await loadSoundModule();

    const result = await playNotificationSound({
      kind: "dm_message",
      deliverSound: true,
      audioSettings: baseAudioSettings,
    });

    expect(result).toEqual({
      played: true,
      reasonCode: "sent",
    });
    expect((globalThis.Audio as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      AUDIO_ASSET_PATHS.notifications.default,
    );
    expect(audioInstances[0]?.volume).toBe(0.7);
    expect(audioInstances[0]?.play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured voice join and leave assets", async () => {
    const { playVoicePresenceSound } = await loadSoundModule();

    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    await playVoicePresenceSound({
      event: "voice_presence_join",
      audioSettings: baseAudioSettings,
    });

    vi.setSystemTime(new Date("2026-03-17T12:00:01.000Z"));
    await playVoicePresenceSound({
      event: "voice_presence_leave",
      audioSettings: baseAudioSettings,
    });

    expect(audioInstances[0]?.src).toBe(AUDIO_ASSET_PATHS.voicePresence.join);
    expect(audioInstances[0]?.volume).toBe(0.55);
    expect(audioInstances[1]?.src).toBe(AUDIO_ASSET_PATHS.voicePresence.leave);
    expect(audioInstances[1]?.volume).toBe(0.55);
  });

  it("respects local sound preference gates for notification and voice sounds", async () => {
    const { playNotificationSound, playVoicePresenceSound } =
      await loadSoundModule();

    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    const notificationResult = await playNotificationSound({
      kind: "dm_message",
      deliverSound: true,
      audioSettings: {
        ...baseAudioSettings,
        masterSoundEnabled: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-17T12:00:01.000Z"));
    const voiceResult = await playVoicePresenceSound({
      event: "voice_presence_join",
      audioSettings: {
        ...baseAudioSettings,
        playSoundsWhenFocused: false,
      },
    });

    expect(notificationResult).toEqual({
      played: false,
      reasonCode: "sound_pref_disabled",
    });
    expect(voiceResult).toEqual({
      played: false,
      reasonCode: "sound_pref_disabled",
    });
    expect(audioInstances).toHaveLength(0);
  });
});
