import type { VoiceSettings } from "../../../types/settings";

/** Capture stays live while RTP is gated. Hard mute/deafen still disable capture. */
export class VoiceInputGate {
  private lastAboveThreshold = -Infinity;

  async sample(
    sender: RTCRtpSender,
    settings: Pick<
      VoiceSettings,
      "transmissionMode" | "voiceActivationThreshold"
    >,
    isBlocked: () => boolean,
    now: number,
    pushToTalkHeld = false,
  ): Promise<{ level: number; gateOpen: boolean }> {
    const track = sender.track;
    if (!track) return { level: 0, gateOpen: false };
    // Never use the transmission gate to disable the capture source.
    track.enabled = !isBlocked();
    const stats = await sender.getStats();
    // Mute/leave may happen while native stats cross the bridge.
    const blocked = isBlocked();
    track.enabled = !blocked;
    let level = 0;
    stats.forEach((report) => {
      if (report.type === "media-source" && report.kind === "audio") {
        const value: unknown = report.audioLevel;
        if (typeof value === "number" && Number.isFinite(value)) {
          level = Math.max(level, Math.max(0, Math.min(1, value)));
        }
      }
    });
    if (blocked) {
      level = 0;
      this.lastAboveThreshold = -Infinity;
    }
    const threshold = Math.max(
      0,
      Math.min(1, settings.voiceActivationThreshold / 100),
    );
    if (!blocked && level >= threshold) this.lastAboveThreshold = now;
    const gateOpen =
      !blocked &&
      (settings.transmissionMode === "open_mic" ||
        (settings.transmissionMode === "push_to_talk"
          ? pushToTalkHeld
          : level >= threshold || now - this.lastAboveThreshold <= 220));
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) {
      track.enabled = false;
      throw new Error("Voice sender has no audio encoding to gate.");
    }
    if (parameters.encodings.some((encoding) => encoding.active !== gateOpen)) {
      for (const encoding of parameters.encodings) encoding.active = gateOpen;
      try {
        await sender.setParameters(parameters);
      } catch (error) {
        // Fail closed rather than accidentally transmitting below threshold.
        track.enabled = false;
        throw error;
      }
    }
    return { level, gateOpen };
  }
}
