import React from "react";
import { Button } from "@shared/app/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/app/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/app/ui/select";
import { Slider } from "@shared/app/ui/slider";
import type {
  VoiceSettings,
} from "@shared/types/settings";
import type { VoicePopoutDeviceOption } from "@shared/infrastructure/platform/desktop/types";
import { useHavenCore } from "@shared/core";
import {
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  VolumeX,
} from "lucide-react";

const DEFAULT_MEMBER_VOLUME = 100;
const MIN_MEMBER_VOLUME = 0;
const MAX_MEMBER_VOLUME = 200;

interface VoiceDrawerProps {
  surface?: "sidebar" | "popout";
  serverName: string;
  channelName: string;
  participantCount: number;
  participantPreview: Array<{
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    isSpeaking?: boolean;
  }>;
  memberControls?: Array<{
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    isSpeaking?: boolean;
    isMuted?: boolean;
    isDeafened?: boolean;
    volume: number;
  }>;
  voiceConnected: boolean;
  voicePanelOpen: boolean;
  joining?: boolean;
  voiceSessionState: {
    joined: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  };
  transmissionMode: VoiceSettings["transmissionMode"];
  inputDevices: VoicePopoutDeviceOption[];
  outputDevices: VoicePopoutDeviceOption[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  supportsOutputSelection?: boolean;
  canOpenVoicePopout?: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onDisconnect: () => void;
  onSelectTransmissionMode: (mode: VoiceSettings["transmissionMode"]) => void;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  onSetMemberVolume?: (userId: string, volume: number) => void;
  onResetMemberVolume?: (userId: string) => void;
  onResetAllMemberVolumes?: () => void;
  onOpenAdvancedOptions: () => void;
  onOpenVoiceHardwareTest: () => void;
  onOpenVoicePopout?: () => void;
}

const TRANSMISSION_MODE_LABELS: Record<
  VoiceSettings["transmissionMode"],
  string
> = {
  voice_activity: "Voice Activity",
  push_to_talk: "Push to Talk",
  open_mic: "Open Mic",
};

function avatarInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

function VoiceMemberAvatar({
  displayName,
  avatarUrl,
  isSpeaking,
  className,
}: {
  displayName: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
  className?: string;
}) {
  return (
    <Avatar
      title={displayName}
      className={[
        "border bg-border",
        isSpeaking ? "border-primary" : "border-border",
        className ?? "size-5",
      ].join(" ")}
    >
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
      <AvatarFallback className="bg-border text-[10px] font-semibold text-white">
        {avatarInitial(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

export function VoiceDrawer({
  surface = "sidebar",
  serverName,
  channelName,
  participantCount,
  participantPreview,
  memberControls = [],
  voiceConnected: voiceConnectedProp,
  voicePanelOpen,
  joining = false,
  voiceSessionState: voiceSessionStateProp,
  transmissionMode,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  supportsOutputSelection = false,
  canOpenVoicePopout = false,
  onOpenChange,
  onJoin,
  onToggleMute,
  onToggleDeafen,
  onDisconnect,
  onSelectTransmissionMode,
  onSelectInputDevice,
  onSelectOutputDevice,
  onSetMemberVolume,
  onResetMemberVolume,
  onResetAllMemberVolumes,
  onOpenAdvancedOptions,
  onOpenVoiceHardwareTest,
  onOpenVoicePopout,
}: VoiceDrawerProps) {
  const voiceSession = useHavenCore().voice.useSession();
  const storedVoiceConnected = voiceSession.voiceConnected;
  const storedVoiceSessionState = voiceSession.sessionState;
  const voiceConnected =
    surface === "popout" ? voiceConnectedProp : storedVoiceConnected;
  const voiceSessionState = React.useMemo(
    () =>
      surface === "popout"
        ? voiceSessionStateProp
        : storedVoiceSessionState ?? {
            joined: false,
            isMuted: false,
            isDeafened: false,
          },
    [storedVoiceSessionState, surface, voiceSessionStateProp],
  );
  const statusLabel = voiceConnected
    ? "Live"
    : joining
      ? "Connecting"
      : voiceSessionState.joined
        ? "Connected"
        : "Standby";
  const isPopoutSurface = surface === "popout";
  const canAdjustMemberVolumes =
    voiceSessionState.joined &&
    memberControls.length > 0 &&
    Boolean(onSetMemberVolume);

  return (
    <div
      className={
        isPopoutSurface
          ? "p-0"
          : "px-2 pt-2 pb-1 border-b border-surface-hover"
      }
    >
      <div className="rounded-md border border-border bg-surface-panel px-2.5 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Voice
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  voiceConnected
                    ? "bg-accent-success/20 text-voice-ok"
                    : "bg-surface-neutral-muted/40 text-neutral-row"
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {channelName}
            </p>
            <p className="truncate text-[11px] text-meta">{serverName}</p>
          </div>

          <Popover open={voicePanelOpen} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className={`shrink-0 hover:bg-surface-hover hover:text-white ${
                  voicePanelOpen ? "text-white" : "text-muted-foreground"
                }`}
                aria-label={
                  voicePanelOpen
                    ? "Close voice quick settings"
                    : "Open voice quick settings"
                }
              >
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[340px] max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto border-border bg-surface-app p-3 text-white"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Voice Quick Settings
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fast device and mode changes. Thresholds, bindings, and
                    diagnostics stay in Voice Settings.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Microphone
                  </p>
                  <Select
                    value={selectedInputDeviceId}
                    onValueChange={onSelectInputDevice}
                  >
                    <SelectTrigger className="w-full border-border bg-surface-panel text-white">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-surface-panel text-white">
                      {inputDevices.length === 0 ? (
                        <SelectItem value="default">
                          Default microphone
                        </SelectItem>
                      ) : (
                        inputDevices.map((device, index) => (
                          <SelectItem
                            key={device.deviceId}
                            value={device.deviceId}
                          >
                            {device.label || `Microphone ${index + 1}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Speaker
                  </p>
                  <Select
                    value={selectedOutputDeviceId}
                    onValueChange={onSelectOutputDevice}
                    disabled={!supportsOutputSelection}
                  >
                    <SelectTrigger className="w-full border-border bg-surface-panel text-white">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-surface-panel text-white">
                      {outputDevices.length === 0 ? (
                        <SelectItem value="default">
                          Default speaker
                        </SelectItem>
                      ) : (
                        outputDevices.map((device, index) => (
                          <SelectItem
                            key={device.deviceId}
                            value={device.deviceId}
                          >
                            {device.label || `Speaker ${index + 1}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {!supportsOutputSelection && (
                    <p className="text-[11px] text-auxiliary">
                      This runtime uses your system default output device.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Transmission
                  </p>
                  <Select
                    value={transmissionMode}
                    onValueChange={(value) =>
                      onSelectTransmissionMode(
                        value as VoiceSettings["transmissionMode"],
                      )
                    }
                  >
                    <SelectTrigger className="w-full border-border bg-surface-panel text-white">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-surface-panel text-white">
                      <SelectItem value="voice_activity">
                        Voice Activity
                      </SelectItem>
                      <SelectItem value="push_to_talk">
                        Push to Talk
                      </SelectItem>
                      <SelectItem value="open_mic">Open Mic</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-auxiliary">
                    {TRANSMISSION_MODE_LABELS[transmissionMode]}{" "}
                    selected. Use Voice Settings for threshold and binding
                    changes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Member Volume
                    </p>
                    {canAdjustMemberVolumes && onResetAllMemberVolumes && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onResetAllMemberVolumes}
                        disabled={voiceSessionState.isDeafened}
                        className="h-7 px-2 text-[11px] text-row hover:bg-surface-hover hover:text-white"
                      >
                        Reset all
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-auxiliary">
                    Per-user volume is local to this client.
                  </p>

                  {canAdjustMemberVolumes ? (
                    <div className="space-y-2">
                      {memberControls.map((member) => {
                        const statusLabel = member.isDeafened
                          ? "Deafened"
                          : member.isMuted
                            ? "Muted"
                            : "Connected";
                        return (
                          <div
                            key={member.userId}
                            className="rounded-md border border-border bg-surface-panel px-2.5 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <VoiceMemberAvatar
                                  displayName={member.displayName}
                                  avatarUrl={member.avatarUrl}
                                  isSpeaking={member.isSpeaking}
                                  className="size-7"
                                />
                                <div className="min-w-0">
                                  <p
                                    className="truncate text-xs font-medium text-white"
                                    title={member.displayName}
                                  >
                                    {member.displayName}
                                  </p>
                                  <p className="text-[10px] text-auxiliary">
                                    {statusLabel}
                                  </p>
                                </div>
                              </div>
                              <span className="shrink-0 text-[11px] font-medium text-row-heading">
                                {member.volume}%
                              </span>
                            </div>

                            <div className="mt-2 flex items-center gap-2">
                              <Slider
                                min={MIN_MEMBER_VOLUME}
                                max={MAX_MEMBER_VOLUME}
                                step={25}
                                value={[member.volume]}
                                onValueChange={(values) => {
                                  const nextVolume = values[0];
                                  if (typeof nextVolume !== "number") return;
                                  onSetMemberVolume?.(member.userId, nextVolume);
                                }}
                                disabled={voiceSessionState.isDeafened}
                                className="w-full"
                                aria-label={`Volume for ${member.displayName}`}
                              />
                              {onResetMemberVolume ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    onResetMemberVolume(member.userId)
                                  }
                                  disabled={
                                    voiceSessionState.isDeafened ||
                                    member.volume === DEFAULT_MEMBER_VOLUME
                                  }
                                  className="h-7 shrink-0 px-2 text-[11px] text-row hover:bg-surface-hover hover:text-white"
                                >
                                  100%
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : voiceSessionState.joined ? (
                    <p className="text-[11px] text-auxiliary">
                      No other participants are connected yet.
                    </p>
                  ) : (
                    <p className="text-[11px] text-auxiliary">
                      Join voice to adjust individual member volume.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenAdvancedOptions();
                    }}
                    className="justify-start border-border bg-surface-panel text-white hover:bg-surface-hover"
                  >
                    Open Voice Settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenVoiceHardwareTest();
                    }}
                    className="justify-start border-border bg-surface-panel text-white hover:bg-surface-hover"
                  >
                    Open Voice Hardware Test
                  </Button>
                  {canOpenVoicePopout && onOpenVoicePopout && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onOpenVoicePopout}
                      className="justify-start border-border bg-surface-panel text-white hover:bg-surface-hover"
                    >
                      <ExternalLink className="size-4" />
                      Open Voice Popout
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {!voiceSessionState.joined ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onJoin}
              className="text-muted-foreground hover:bg-surface-hover hover:text-white"
              aria-label="Join voice"
            >
              <Headphones className="size-4" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onToggleMute}
                className={`hover:bg-surface-hover ${
                  voiceSessionState.isMuted
                    ? "text-destructive-icon hover:text-destructive-hover-fg"
                    : "text-muted-foreground hover:text-white"
                }`}
                aria-label={voiceSessionState.isMuted ? "Unmute" : "Mute"}
              >
                {voiceSessionState.isMuted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onToggleDeafen}
                className={`hover:bg-surface-hover ${
                  voiceSessionState.isDeafened
                    ? "text-destructive-icon hover:text-destructive-hover-fg"
                    : "text-muted-foreground hover:text-white"
                }`}
                aria-label={
                  voiceSessionState.isDeafened ? "Undeafen" : "Deafen"
                }
              >
                <VolumeX className="size-4" />
              </Button>
            </>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onDisconnect}
            className="text-destructive-warm hover:bg-surface-destructive-row-hover hover:text-destructive-pale"
            aria-label="Leave voice"
          >
            <PhoneOff className="size-4" />
          </Button>
          <div className="ml-auto text-[11px] text-meta">
            {participantCount} in call
          </div>
        </div>

        <div className="mt-3 flex min-h-5 items-center gap-1 pl-0.5">
          {participantPreview.slice(0, 4).map((participant) => (
            <VoiceMemberAvatar
              key={participant.userId}
              displayName={participant.displayName}
              avatarUrl={participant.avatarUrl}
              isSpeaking={participant.isSpeaking}
            />
          ))}
          {participantPreview.length > 4 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-surface-hover text-[10px] font-semibold text-avatar-fallback">
              +{participantPreview.length - 4}
            </span>
          )}
          {participantPreview.length === 0 && (
            <span className="text-[11px] text-auxiliary">
              Waiting for participants.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
