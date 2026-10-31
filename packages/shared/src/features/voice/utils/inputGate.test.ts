import { describe, expect, it, vi } from "vitest";
import { VoiceInputGate } from "./inputGate";

function microphone() {
  let input = 0;
  let active = true;
  const track = { enabled: true };
  const sender = {
    track,
    getStats: vi.fn(
      async () =>
        new Map([
          [
            "capture",
            {
              type: "media-source",
              kind: "audio",
              audioLevel: track.enabled ? input : 0,
            },
          ],
        ]),
    ),
    getParameters: () => ({ encodings: [{ active }] }),
    setParameters: vi.fn(async (parameters: RTCRtpSendParameters) => {
      active = parameters.encodings[0].active ?? true;
    }),
  };
  return {
    sender: sender as unknown as RTCRtpSender,
    track,
    setInput: (value: number) => {
      input = value;
    },
    transmitting: () => active && track.enabled,
  };
}

describe("VoiceInputGate", () => {
  const settings = {
    transmissionMode: "voice_activity" as const,
    voiceActivationThreshold: 30,
  };

  it("reopens from silence above a nonzero threshold without disabling capture", async () => {
    const mic = microphone();
    const gate = new VoiceInputGate();
    expect(await gate.sample(mic.sender, settings, () => false, 1000)).toEqual({
      level: 0,
      gateOpen: false,
    });
    expect(mic.transmitting()).toBe(false);
    expect(mic.track.enabled).toBe(true);
    mic.setInput(0.6);
    expect(await gate.sample(mic.sender, settings, () => false, 1080)).toEqual({
      level: 0.6,
      gateOpen: true,
    });
    expect(mic.transmitting()).toBe(true);
    mic.setInput(0.1);
    expect(
      (await gate.sample(mic.sender, settings, () => false, 1240)).gateOpen,
    ).toBe(true);
    expect(await gate.sample(mic.sender, settings, () => false, 1320)).toEqual({
      level: 0.1,
      gateOpen: false,
    });
    expect(mic.transmitting()).toBe(false);
  });

  it("hard mutes capture and recovers on unmute; PTT requires a held key", async () => {
    const mic = microphone();
    const gate = new VoiceInputGate();
    mic.setInput(0.8);
    await gate.sample(mic.sender, settings, () => true, 1000);
    expect(mic.track.enabled).toBe(false);
    expect(mic.transmitting()).toBe(false);
    expect(
      (await gate.sample(mic.sender, settings, () => false, 1080)).level,
    ).toBe(0.8);
    const ptt = { ...settings, transmissionMode: "push_to_talk" as const };
    await gate.sample(mic.sender, ptt, () => false, 1160);
    expect(mic.transmitting()).toBe(false);
    await gate.sample(mic.sender, ptt, () => false, 1240, true);
    expect(mic.transmitting()).toBe(true);
    await gate.sample(
      mic.sender,
      { ...settings, transmissionMode: "open_mic" },
      () => false,
      1320,
    );
    expect(mic.transmitting()).toBe(true);
  });

  it("rechecks hard mute after pending stats and fails closed on sender errors", async () => {
    const mic = microphone();
    const gate = new VoiceInputGate();
    let blocked = false;
    const original = mic.sender.getStats.bind(mic.sender);
    mic.sender.getStats = async () => {
      blocked = true;
      return original();
    };
    await gate.sample(mic.sender, settings, () => blocked, 1000);
    expect(mic.transmitting()).toBe(false);
    mic.sender.setParameters = async () => {
      throw new Error("native failure");
    };
    await expect(
      gate.sample(
        mic.sender,
        { ...settings, transmissionMode: "open_mic" },
        () => false,
        1080,
      ),
    ).rejects.toThrow("native failure");
    expect(mic.track.enabled).toBe(false);
  });
});
