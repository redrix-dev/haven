import React from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";

type Props = { room: Room };

/**
 * Attaches a hidden <audio> element for every subscribed remote audio track in
 * a LiveKit room. Replaces @livekit/components-react's RoomAudioRenderer so we
 * don't need that package (or its bundled React copy).
 *
 * Output-device switching via room.switchActiveDevice('audiooutput', id) still
 * works — LiveKit iterates all attached HTMLAudioElements internally.
 */
export function LiveKitAudioRenderer({ room }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // sid → the element we created so we can remove it precisely on unsubscribe
    const attached = new Map<string, HTMLAudioElement>();

    function attachAudio(track: RemoteTrack) {
      if (track.kind !== Track.Kind.Audio) return;
      const sid = track.sid;
      if (!sid) return;
      if (attached.has(sid)) return;
      const el = track.attach() as HTMLAudioElement;
      el.style.display = "none";
      container!.appendChild(el);
      attached.set(sid, el);
    }

    function detachAudio(track: RemoteTrack) {
      if (track.kind !== Track.Kind.Audio) return;
      const sid = track.sid;
      if (!sid) return;
      const el = attached.get(sid);
      if (!el) return;
      track.detach(el);
      el.remove();
      attached.delete(sid);
    }

    room.on(RoomEvent.TrackSubscribed, attachAudio);
    room.on(RoomEvent.TrackUnsubscribed, detachAudio);

    // Attach any tracks that were already subscribed before this effect ran
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        if (pub.isSubscribed && pub.track) attachAudio(pub.track);
      }
    }

    return () => {
      room.off(RoomEvent.TrackSubscribed, attachAudio);
      room.off(RoomEvent.TrackUnsubscribed, detachAudio);
      for (const el of attached.values()) el.remove();
      attached.clear();
    };
  }, [room]);

  return <div ref={containerRef} aria-hidden style={{ display: "none" }} />;
}
