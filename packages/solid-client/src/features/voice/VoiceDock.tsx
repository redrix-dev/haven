import { For, Show, createSignal, type JSX } from "solid-js";
import * as Dialog from "@kobalte/core/dialog";
import {
  ChevronDown,
  ChevronUp,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  X,
} from "lucide-solid";
import { useVoice } from "@solid-client/contexts/VoiceProvider";
import { requireHavenSolidCore } from "@solid-client/core";
import { Button, Tooltip } from "@solid-client/components/ui";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { VoiceParticipantCard } from "./VoiceParticipantCard";
import { VoiceAudioSettings } from "./VoiceAudioSettings";

function VoiceModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  full?: boolean;
  restoreFocus: () => HTMLElement | undefined;
  children: JSX.Element;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm" />
        <Dialog.Content
          class={`fixed left-1/2 top-1/2 z-[80] max-h-[90vh] w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-xl ${props.full ? "max-w-4xl" : "max-w-md"}`}
          onCloseAutoFocus={(event) => {
            const target = props.restoreFocus();
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <header class="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title class="text-xl font-semibold">
                {props.title}
              </Dialog.Title>
              <Dialog.Description class="mt-1 text-xs text-muted-foreground">
                {props.description}
              </Dialog.Description>
            </div>
            <Dialog.CloseButton
              class="rounded p-2 text-muted-foreground hover:bg-surface-hover"
              aria-label={
                props.full ? "Return to voice drawer" : "Close audio settings"
              }
            >
              {props.full ? <Minimize2 size={18} /> : <X size={18} />}
            </Dialog.CloseButton>
          </header>
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function VoiceSessionButtons(props: {
  onSettings: (element: HTMLButtonElement) => void;
}) {
  const { voice, toggleMute, toggleDeafen, leave } = useVoice();
  return (
    <div class="flex items-center gap-2">
      <Tooltip content={voice.isMuted ? "Unmute" : "Mute"}>
        <Button
          size="icon"
          variant="ghost"
          class="h-9 w-9"
          aria-label={voice.isMuted ? "Unmute" : "Mute"}
          onClick={toggleMute}
        >
          {voice.isMuted ? (
            <MicOff size={17} class="text-destructive" />
          ) : (
            <Mic size={17} />
          )}
        </Button>
      </Tooltip>
      <Tooltip content={voice.isDeafened ? "Undeafen" : "Deafen"}>
        <Button
          size="icon"
          variant="ghost"
          class="h-9 w-9"
          aria-label={voice.isDeafened ? "Undeafen" : "Deafen"}
          onClick={toggleDeafen}
        >
          {voice.isDeafened ? (
            <HeadphoneOff size={17} class="text-destructive" />
          ) : (
            <Headphones size={17} />
          )}
        </Button>
      </Tooltip>
      <Tooltip content="Audio settings">
        <Button
          size="icon"
          variant="ghost"
          class="h-9 w-9"
          aria-label="Microphone and audio settings"
          onClick={(event) => props.onSettings(event.currentTarget)}
        >
          <Settings size={17} />
        </Button>
      </Tooltip>
      <div class="flex-1" />
      <Tooltip content="Leave voice">
        <Button
          size="icon"
          variant="ghost"
          class="h-9 w-9 text-destructive"
          aria-label="Leave voice"
          onClick={() => void leave()}
        >
          <PhoneOff size={17} />
        </Button>
      </Tooltip>
    </div>
  );
}

/** Three views of one in-window session. The separate Tauri popout stays hidden. */
export function VoiceDock() {
  const core = requireHavenSolidCore();
  const { voice, enableAudioPlayback } = useVoice();
  const myId = () => core.authStore.getState().user?.id ?? "";
  const profile = core.profiles.viewerProfile(myId);
  const [expanded, setExpanded] = createSignal(false);
  const [full, setFull] = createSignal(false);
  const [settings, setSettings] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  let fullTrigger: HTMLButtonElement | undefined;
  let settingsTrigger: HTMLButtonElement | undefined;
  const loadControls = () => {
    const communityId = voice.activeChannel?.communityId;
    if (!communityId) return;
    setLoadError(null);
    void Promise.all([
      core.ensureCommunityPermissions(communityId),
      core.admin.ensureMembersLoaded(communityId),
      core.admin.loadRoleManagement(communityId),
    ]).catch((error) =>
      setLoadError(getErrorMessage(error, "Could not load member controls.")),
    );
  };
  const openSettings = (element: HTMLButtonElement) => {
    settingsTrigger = element;
    setSettings(true);
  };
  const participants = (large: boolean) => (
    <>
      <VoiceParticipantCard
        self
        full={large}
        participant={{
          userId: myId(),
          displayName: profile()?.username ?? "You",
          avatarUrl: profile()?.avatarUrl,
          muted: voice.isMuted,
          deafened: voice.isDeafened,
          isSpeaking: voice.localSpeaking,
        }}
      />
      <For each={voice.participants}>
        {(participant) => (
          <VoiceParticipantCard participant={participant} full={large} />
        )}
      </For>
    </>
  );
  return (
    <Show when={voice.activeChannel}>
      {(channel) => (
        <>
          <section
            aria-label="Voice drawer"
            class="border-t border-border bg-surface-footer-bar px-3 py-2"
          >
            <Show when={voice.audioPlaybackBlocked}>
              <button
                onClick={() => void enableAudioPlayback()}
                class="mb-2 w-full rounded bg-primary/20 px-2 py-1 text-xs font-semibold text-primary"
              >
                Click to enable audio
              </button>
            </Show>
            <div class="flex items-center gap-1">
              <span
                class="mr-1 h-1.5 w-1.5 rounded-full"
                classList={{
                  "bg-accent-success": voice.joined,
                  "bg-muted-foreground": !voice.joined,
                }}
              />
              <span
                class="flex-1 text-xs font-medium"
                classList={{
                  "text-accent-success": voice.joined,
                  "text-muted-foreground": !voice.joined,
                }}
              >
                {voice.joining
                  ? "Connecting…"
                  : voice.joined
                    ? "Voice connected"
                    : "Voice disconnected"}
              </span>
              <Button
                ref={fullTrigger}
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                aria-label="Expand to full voice screen"
                onClick={() => {
                  loadControls();
                  setFull(true);
                }}
              >
                <Maximize2 size={13} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                aria-label={
                  expanded() ? "Collapse participants" : "Expand participants"
                }
                aria-expanded={expanded()}
                onClick={() => {
                  const next = !expanded();
                  setExpanded(next);
                  if (next) loadControls();
                }}
              >
                {expanded() ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronUp size={14} />
                )}
              </Button>
            </div>
            <p class="mb-2 ml-3 truncate text-xs text-muted-foreground">
              {channel().channelName}
            </p>
            <Show when={voice.error}>
              <p role="alert" class="mb-2 text-xs text-destructive">
                {voice.error}
              </p>
            </Show>
            <Show when={voice.notice}>
              <p class="mb-2 text-xs text-muted-foreground">{voice.notice}</p>
            </Show>
            <Show when={loadError()}>
              <p role="alert" class="mb-2 text-xs text-destructive">
                {loadError()}
              </p>
            </Show>
            <Show when={expanded()}>
              <div class="mb-2 space-y-1" aria-label="Voice participants">
                {participants(false)}
              </div>
            </Show>
            <VoiceSessionButtons onSettings={openSettings} />
          </section>
          <VoiceModal
            open={full()}
            onOpenChange={setFull}
            full
            title={channel().channelName}
            description={`Voice connected · ${voice.participants.length + 1} people`}
            restoreFocus={() => fullTrigger}
          >
            <div
              class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Call participants"
            >
              {participants(true)}
            </div>
            <div class="mx-auto mt-6 max-w-xs">
              <VoiceSessionButtons onSettings={openSettings} />
            </div>
          </VoiceModal>
          <VoiceModal
            open={settings()}
            onOpenChange={setSettings}
            title="Audio settings"
            description="Microphone, transmission and playback"
            restoreFocus={() => settingsTrigger}
          >
            <VoiceAudioSettings />
          </VoiceModal>
        </>
      )}
    </Show>
  );
}
