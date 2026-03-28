// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_AUDIO_URLS } from "@platform/assets/runtimeAudio";
import type { NotificationAudioSettings } from "@platform/desktop/types";

const baseAudioSettings: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 70,
  voicePresenceSoundVolume: 55,
  voicePresenceSoundEnabled: true,
  playSoundsWhenFocused: true,
};

type MockAudioInstance = {
  src: string;
  volume: number;
  gainValue: number;
};

let audioInstances: MockAudioInstance[] = [];

const loadSoundModule = async () => {
  vi.resetModules();
  return import("@shared/lib/notifications/sound");
};

describe("notification sound helpers", () => {
  beforeEach(() => {
    audioInstances = [];

    const mockArrayBuffer = new ArrayBuffer(8);
    const mockAudioBuffer = {};

    const mockSource = {
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null as unknown,
    };

    const mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };

    const mockAudioContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
      createBufferSource: vi.fn().mockReturnValue(mockSource),
      createGain: vi.fn().mockReturnValue(mockGainNode),
      destination: {},
      close: vi.fn(),
    };

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: vi.fn(() => mockAudioContext),
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn((url: string) => {
        audioInstances.push({
          src: url,
          volume: 1,
          gainValue: mockGainNode.gain.value,
        });
        return Promise.resolve({
          arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        });
      }),
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

    expect(result).toEqual({ played: true, reasonCode: "sent" });
    expect(audioInstances[0]?.src).toBe(
      RUNTIME_AUDIO_URLS.notifications.default,
    );
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

    expect(audioInstances[0]?.src).toBe(RUNTIME_AUDIO_URLS.voicePresence.join);
    expect(audioInstances[1]?.src).toBe(RUNTIME_AUDIO_URLS.voicePresence.leave);
  });

  it("respects local sound preference gates for notification and voice sounds", async () => {
    const { playNotificationSound, playVoicePresenceSound } =
      await loadSoundModule();

    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    const notificationResult = await playNotificationSound({
      kind: "dm_message",
      deliverSound: true,
      audioSettings: { ...baseAudioSettings, masterSoundEnabled: false },
    });

    vi.setSystemTime(new Date("2026-03-17T12:00:01.000Z"));
    const voiceResult = await playVoicePresenceSound({
      event: "voice_presence_join",
      audioSettings: { ...baseAudioSettings, playSoundsWhenFocused: false },
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
