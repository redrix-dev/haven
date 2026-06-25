import { createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  openVoiceSyncChannel,
  type VoiceMirrorState,
} from "@solid-client/contexts/voiceSync";
import { VoicePopoutPanel, type VoicePopoutCommand } from "./VoicePopoutPanel";

/**
 * The voice popout surface (/popout/voice) — a MIRROR + REMOTE CONTROL of the
 * window that owns the LiveKit connection (decision record in voiceSync.ts /
 * SOLID_CLIENT_SHAPE.md). It renders broadcast state and sends commands; it
 * never joins LiveKit itself, so audio keeps playing from the main window.
 */

const emptyMirror = (): VoiceMirrorState => ({
  activeChannel: null,
  joined: false,
  joining: false,
  isMuted: false,
  isDeafened: false,
  participants: [],
  selfDisplayName: "You",
  selfAvatarUrl: null,
  error: null,
  notice: null,
});

export function VoicePopout() {
  const [mirror, setMirror] = createStore<VoiceMirrorState>(emptyMirror());
  const [received, setReceived] = createSignal(false);

  const sync = openVoiceSyncChannel();
  sync.onmessage = (event: MessageEvent) => {
    const message = event.data as { kind?: string; state?: VoiceMirrorState };
    if (message.kind !== "state" || !message.state) return;
    const incoming = message.state;
    // Joined/joining states always win. An idle state is only meaningful as
    // "the session ended" (we were showing a joined state) or as the first
    // answer to our hello.
    if (incoming.joined || incoming.joining || mirror.joined || !received()) {
      setMirror(reconcile(incoming));
      setReceived(true);
    }
  };
  sync.postMessage({ kind: "hello" });
  onCleanup(() => sync.close());

  const send = (command: VoicePopoutCommand) => {
    sync.postMessage({ kind: "command", command });
  };

  return <VoicePopoutPanel mirror={mirror} onCommand={send} />;
}
