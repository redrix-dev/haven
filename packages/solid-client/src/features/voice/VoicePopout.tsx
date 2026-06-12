import { For, Show, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
} from "lucide-solid";
import { Avatar, Button } from "@solid-client/components/ui";
import {
  openVoiceSyncChannel,
  type VoiceMirrorState,
} from "@solid-client/contexts/voiceSync";

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

  const send = (command: "toggleMute" | "toggleDeafen" | "leave") => {
    sync.postMessage({ kind: "command", command });
  };

  return (
    <div class="flex h-full flex-col bg-background">
      <header class="flex h-10 shrink-0 items-center gap-2 border-b border-border-titlebar px-3">
        <Volume2
          size={14}
          class={mirror.joined ? "text-accent-success" : "text-muted-foreground"}
        />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {mirror.activeChannel?.channelName ?? "Voice"}
        </span>
      </header>

      <Show
        when={mirror.activeChannel}
        fallback={
          <div class="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Not connected to voice.
          </div>
        }
      >
        <div class="flex-1 overflow-y-auto px-3 py-2">
          {/* Self row first, then remotes — same ordering as the sidebar. */}
          <ParticipantRow
            name={`${mirror.selfDisplayName} (you)`}
            avatarUrl={null}
            speaking={false}
            muted={mirror.isMuted}
          />
          <For each={mirror.participants}>
            {(participant) => (
              <ParticipantRow
                name={participant.displayName}
                avatarUrl={participant.avatarUrl ?? null}
                speaking={participant.isSpeaking ?? false}
                muted={participant.muted}
              />
            )}
          </For>
        </div>

        <div class="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2">
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            aria-label={mirror.isMuted ? "Unmute" : "Mute"}
            onClick={() => send("toggleMute")}
          >
            {mirror.isMuted ? (
              <MicOff size={18} class="text-destructive" />
            ) : (
              <Mic size={18} />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            aria-label={mirror.isDeafened ? "Undeafen" : "Deafen"}
            onClick={() => send("toggleDeafen")}
          >
            {mirror.isDeafened ? (
              <HeadphoneOff size={18} class="text-destructive" />
            ) : (
              <Headphones size={18} />
            )}
          </Button>
          <div class="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            aria-label="Disconnect"
            onClick={() => send("leave")}
          >
            <PhoneOff size={18} class="text-destructive" />
          </Button>
        </div>
      </Show>
    </div>
  );
}

function ParticipantRow(props: {
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
}) {
  return (
    <div class="flex items-center gap-2 rounded px-1 py-1">
      <span
        class="rounded-full"
        classList={{ "ring-2 ring-accent-success": props.speaking }}
      >
        <Avatar src={props.avatarUrl} name={props.name} size="sm" />
      </span>
      <span class="min-w-0 flex-1 truncate text-sm text-body-soft">
        {props.name}
      </span>
      <Show when={props.muted}>
        <MicOff size={12} class="shrink-0 text-muted-foreground" />
      </Show>
    </div>
  );
}
