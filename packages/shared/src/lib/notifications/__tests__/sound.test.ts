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
};

type MockAudioContextInstance = {
  close: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  decodeAudioData: ReturnType<typeof vi.fn>;
  destination: object;
  gainNode: {
    connect: ReturnType<typeof vi.fn>;
    gain: { value: number };
  };
  source: {
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
  };
};

let audioInstances: MockAudioInstance[] = [];
let audioContexts: MockAudioContextInstance[] = [];

const loadSoundModule = async () => {
  vi.resetModules();
  return import("@shared/lib/notifications/sound");
};

describe("notification sound helpers", () => {
  beforeEach(() => {
    audioInstances = [];
    audioContexts = [];

    const mockArrayBuffer = new ArrayBuffer(8);
    const mockAudioBuffer = { kind: "decoded-buffer" };

    const AudioContextMock = vi.fn(function MockAudioContext() {
      const mockSource = {
        buffer: null as unknown,
        connect: vi.fn(),
        start: vi.fn(),
        onended: null as (() => void) | null,
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
        gainNode: mockGainNode,
        source: mockSource,
      } satisfies MockAudioContextInstance;

      audioContexts.push(mockAudioContext);
      return mockAudioContext;
    });

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: AudioContextMock,
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn((url: string) => {
        audioInstances.push({
          src: url,
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
    expect(audioContexts).toHaveLength(1);
    expect(audioContexts[0]?.gainNode.gain.value).toBe(0.7);
    expect(audioContexts[0]?.source.buffer).toEqual({ kind: "decoded-buffer" });
    expect(audioContexts[0]?.source.connect).toHaveBeenCalledWith(
      audioContexts[0]?.gainNode,
    );
    expect(audioContexts[0]?.gainNode.connect).toHaveBeenCalledWith(
      audioContexts[0]?.destination,
    );
    expect(audioContexts[0]?.source.start).toHaveBeenCalledWith(0);
    audioContexts[0]?.source.onended?.();
    expect(audioContexts[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("plays the configured voice join and leave assets", async () => {
    const { playVoicePresenceSound } = await loadSoundModule();

    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    const joinResult = await playVoicePresenceSound({
      event: "voice_presence_join",
      audioSettings: baseAudioSettings,
    });

    vi.setSystemTime(new Date("2026-03-17T12:00:01.000Z"));
    const leaveResult = await playVoicePresenceSound({
      event: "voice_presence_leave",
      audioSettings: baseAudioSettings,
    });

    expect(joinResult).toEqual({ played: true, reasonCode: "sent" });
    expect(leaveResult).toEqual({ played: true, reasonCode: "sent" });
    expect(audioInstances[0]?.src).toBe(RUNTIME_AUDIO_URLS.voicePresence.join);
    expect(audioInstances[1]?.src).toBe(RUNTIME_AUDIO_URLS.voicePresence.leave);
    expect(audioContexts).toHaveLength(2);
    expect(audioContexts[0]?.gainNode.gain.value).toBe(0.55);
    expect(audioContexts[1]?.gainNode.gain.value).toBe(0.55);
    expect(audioContexts[0]?.source.start).toHaveBeenCalledWith(0);
    expect(audioContexts[1]?.source.start).toHaveBeenCalledWith(0);
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
    expect(audioContexts).toHaveLength(0);
  });
});
