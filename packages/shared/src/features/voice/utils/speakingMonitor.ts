import { Track } from "livekit-client";

type SpeakingParticipant = {
  identity: string;
  isSpeaking: boolean;
  getTrackPublication: (source: Track.Source) =>
    | {
        isMuted: boolean;
        audioTrack?: {
          mediaStreamTrack: { enabled: boolean };
          sender?: RTCRtpSender;
          receiver?: RTCRtpReceiver;
        };
      }
    | undefined;
};

// Structural port: mobile and web own independently resolved LiveKit SDKs.
type SpeakingRoom = {
  localParticipant: SpeakingParticipant;
  remoteParticipants: ReadonlyMap<string, SpeakingParticipant>;
};

/** SDK participant.isSpeaking is server-fed; read receiver/capture stats locally. */
export function monitorSpeaking(
  room: SpeakingRoom,
  onChange: (speaking: ReadonlyMap<string, boolean>) => void,
): () => void {
  let stopped = false;
  let busy = false;
  let previous = new Map<string, boolean>();
  const lastLoud = new Map<string, number>();
  const sample = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const participants = [
        room.localParticipant,
        ...room.remoteParticipants.values(),
      ];
      const entries = await Promise.all(
        participants.map(async (participant): Promise<[string, boolean]> => {
          const local = participant === room.localParticipant;
          const publication = participant.getTrackPublication(
            Track.Source.Microphone,
          );
          const track = publication?.audioTrack;
          const sender =
            local && track && "sender" in track
              ? (track.sender as RTCRtpSender | undefined)
              : undefined;
          const receiver =
            track && "receiver" in track
              ? (track.receiver as RTCRtpReceiver | undefined)
              : undefined;
          const transport = local ? sender : receiver;
          const allowed =
            !!track &&
            !publication?.isMuted &&
            track.mediaStreamTrack.enabled &&
            (!sender ||
              sender
                .getParameters()
                .encodings.every((encoding) => encoding.active !== false));
          if (!allowed) {
            lastLoud.delete(participant.identity);
            return [participant.identity, false];
          }
          let level: number | undefined;
          try {
            const stats = await transport?.getStats();
            stats?.forEach((report) => {
              if (
                report.type === (local ? "media-source" : "inbound-rtp") &&
                (report.kind === "audio" || report.mediaType === "audio") &&
                typeof report.audioLevel === "number" &&
                Number.isFinite(report.audioLevel)
              ) {
                level = Math.max(level ?? 0, report.audioLevel);
              }
            });
          } catch {
            /* Participant events remain a fallback on unsupported clients. */
          }
          if (level === undefined)
            return [participant.identity, participant.isSpeaking];
          const now = Date.now();
          if (level > 0.015) lastLoud.set(participant.identity, now);
          return [
            participant.identity,
            now - (lastLoud.get(participant.identity) ?? -Infinity) <= 160,
          ];
        }),
      );
      if (stopped) return;
      const next = new Map(entries);
      for (const id of lastLoud.keys()) if (!next.has(id)) lastLoud.delete(id);
      if (
        next.size !== previous.size ||
        [...next].some(([id, speaking]) => previous.get(id) !== speaking)
      ) {
        previous = next;
        onChange(next);
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void sample(), 80);
  void sample();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
