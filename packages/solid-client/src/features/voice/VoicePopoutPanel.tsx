import { For, Show } from "solid-js";
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
} from "lucide-solid";
import { Avatar, Button } from "@solid-client/components/ui";
import type { VoiceMirrorState } from "@solid-client/contexts/voiceSync";

export type VoicePopoutCommand = "toggleMute" | "toggleDeafen" | "leave";

export function VoicePopoutPanel(props: {
  mirror: VoiceMirrorState;
  onCommand: (command: VoicePopoutCommand) => void;
}) {
  return (
    <div class="flex h-full flex-col bg-background">
      <header class="flex h-10 shrink-0 items-center gap-2 border-b border-border-titlebar px-3">
        <Volume2
          size={14}
          class={
            props.mirror.joined
              ? "text-accent-success"
              : "text-muted-foreground"
          }
        />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {props.mirror.activeChannel?.channelName ?? "Voice"}
        </span>
      </header>

      <Show
        when={props.mirror.activeChannel}
        fallback={
          <div class="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Not connected to voice.
          </div>
        }
      >
        <div class="flex-1 overflow-y-auto px-3 py-2">
          <ParticipantRow
            name={`${props.mirror.selfDisplayName} (you)`}
            avatarUrl={props.mirror.selfAvatarUrl}
            speaking={false}
            muted={props.mirror.isMuted}
          />
          <For each={props.mirror.participants}>
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
            aria-label={props.mirror.isMuted ? "Unmute" : "Mute"}
            onClick={() => props.onCommand("toggleMute")}
          >
            {props.mirror.isMuted ? (
              <MicOff size={18} class="text-destructive" />
            ) : (
              <Mic size={18} />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            aria-label={props.mirror.isDeafened ? "Undeafen" : "Deafen"}
            onClick={() => props.onCommand("toggleDeafen")}
          >
            {props.mirror.isDeafened ? (
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
            onClick={() => props.onCommand("leave")}
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
