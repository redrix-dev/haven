import { Show } from "solid-js";
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
  Volume2,
} from "lucide-solid";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { useBridge } from "@solid-client/contexts/BridgeProvider";
import { Button, Tooltip } from "@solid-client/components/ui";

/**
 * The connected-voice control strip pinned under the sidebar: channel name,
 * mute/deafen/leave, and the popout launcher. Renders nothing while not in
 * voice.
 */
export function VoiceDock() {
  const { voice, toggleMute, toggleDeafen, leave, enableAudioPlayback } =
    useVoice();
  const bridge = useBridge();

  const openPopout = () => {
    void bridge.openPopout("/popout/voice", {
      label: "voice-popout",
      title: "Haven — Voice",
      width: 340,
      height: 520,
      alwaysOnTop: true,
    });
  };

  return (
    <Show when={voice.activeChannel}>
      {(channel) => (
        <div class="border-t border-border bg-surface-footer-bar px-3 py-2">
          <Show when={voice.audioPlaybackBlocked}>
            <button
              onClick={() => void enableAudioPlayback()}
              class="mb-2 w-full rounded bg-primary/20 px-2 py-1 text-xs font-semibold text-primary"
            >
              Click to enable audio
            </button>
          </Show>

          <div class="mb-1.5 flex items-center gap-2">
            <Volume2
              size={14}
              class={voice.joined ? "text-accent-success" : "text-muted-foreground"}
            />
            <span class="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {voice.joining ? "Connecting…" : channel().channelName}
            </span>
          </div>

          <Show when={voice.error}>
            <p class="mb-1 text-xs text-send-error">{voice.error}</p>
          </Show>
          <Show when={voice.notice}>
            <p class="mb-1 text-xs text-muted-foreground">{voice.notice}</p>
          </Show>

          <div class="flex items-center gap-1">
            <Tooltip content={voice.isMuted ? "Unmute" : "Mute"} placement="top">
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8"
                aria-label={voice.isMuted ? "Unmute" : "Mute"}
                onClick={toggleMute}
              >
                {voice.isMuted ? (
                  <MicOff size={16} class="text-destructive" />
                ) : (
                  <Mic size={16} />
                )}
              </Button>
            </Tooltip>
            <Tooltip
              content={voice.isDeafened ? "Undeafen" : "Deafen"}
              placement="top"
            >
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8"
                aria-label={voice.isDeafened ? "Undeafen" : "Deafen"}
                onClick={toggleDeafen}
              >
                {voice.isDeafened ? (
                  <HeadphoneOff size={16} class="text-destructive" />
                ) : (
                  <Headphones size={16} />
                )}
              </Button>
            </Tooltip>
            <Tooltip content="Pop out" placement="top">
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8"
                aria-label="Pop out voice controls"
                onClick={openPopout}
              >
                <PictureInPicture2 size={16} />
              </Button>
            </Tooltip>
            <div class="flex-1" />
            <Tooltip content="Disconnect" placement="top">
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8"
                aria-label="Disconnect from voice"
                onClick={() => void leave()}
              >
                <PhoneOff size={16} class="text-destructive" />
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </Show>
  );
}
