import React from "react";
import { Button } from "@shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/components/ui/select";
import type {
  VoicePopoutDeviceOption,
  VoiceSettings,
} from "@platform/desktop/types";
import {
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  VolumeX,
} from "lucide-react";

interface VoiceDrawerProps {
  surface?: "sidebar" | "popout";
  serverName: string;
  channelName: string;
  participantCount: number;
  participantPreview: Array<{ userId: string; displayName: string }>;
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

export function VoiceDrawer({
  surface = "sidebar",
  serverName,
  channelName,
  participantCount,
  participantPreview,
  voiceConnected,
  voicePanelOpen,
  joining = false,
  voiceSessionState,
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
  onOpenAdvancedOptions,
  onOpenVoiceHardwareTest,
  onOpenVoicePopout,
}: VoiceDrawerProps) {
  const statusLabel = voiceConnected
    ? "Live"
    : joining
      ? "Connecting"
      : voiceSessionState.joined
        ? "Connected"
        : "Standby";
  const isPopoutSurface = surface === "popout";

  return (
    <div
      className={
        isPopoutSurface
          ? "p-0"
          : "px-2 pt-2 pb-1 border-b border-[#22334f]"
      }
    >
      <div className="rounded-md border border-[#304867] bg-[#142033] px-2.5 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8ea4c7]">
                Voice
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  voiceConnected
                    ? "bg-[#2f9f73]/20 text-[#6dd5a6]"
                    : "bg-[#44546f]/40 text-[#c6d2e7]"
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {channelName}
            </p>
            <p className="truncate text-[11px] text-[#95a5bf]">{serverName}</p>
          </div>

          <Popover open={voicePanelOpen} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className={`shrink-0 hover:bg-[#22334f] hover:text-white ${
                  voicePanelOpen ? "text-white" : "text-[#a9b8cf]"
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
              className="w-[300px] border-[#304867] bg-[#111a2b] p-3 text-white"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Voice Quick Settings
                  </p>
                  <p className="text-xs text-[#9fb2cf]">
                    Fast device and mode changes. Thresholds, bindings, and
                    diagnostics stay in Voice Settings.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8ea4c7]">
                    Microphone
                  </p>
                  <Select
                    value={selectedInputDeviceId}
                    onValueChange={onSelectInputDevice}
                  >
                    <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent className="border-[#304867] bg-[#142033] text-white">
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8ea4c7]">
                    Speaker
                  </p>
                  <Select
                    value={selectedOutputDeviceId}
                    onValueChange={onSelectOutputDevice}
                    disabled={!supportsOutputSelection}
                  >
                    <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent className="border-[#304867] bg-[#142033] text-white">
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
                    <p className="text-[11px] text-[#90a5c4]">
                      This runtime uses your system default output device.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8ea4c7]">
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
                    <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent className="border-[#304867] bg-[#142033] text-white">
                      <SelectItem value="voice_activity">
                        Voice Activity
                      </SelectItem>
                      <SelectItem value="push_to_talk">
                        Push to Talk
                      </SelectItem>
                      <SelectItem value="open_mic">Open Mic</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-[#90a5c4]">
                    {TRANSMISSION_MODE_LABELS[transmissionMode]}{" "}
                    selected. Use Voice Settings for threshold and binding
                    changes.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenAdvancedOptions();
                    }}
                    className="justify-start border-[#304867] bg-[#142033] text-white hover:bg-[#22334f]"
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
                    className="justify-start border-[#304867] bg-[#142033] text-white hover:bg-[#22334f]"
                  >
                    Open Voice Hardware Test
                  </Button>
                  {canOpenVoicePopout && onOpenVoicePopout && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onOpenVoicePopout}
                      className="justify-start border-[#304867] bg-[#142033] text-white hover:bg-[#22334f]"
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
              className="text-[#a9b8cf] hover:bg-[#22334f] hover:text-white"
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
                className={`hover:bg-[#22334f] ${
                  voiceSessionState.isMuted
                    ? "text-[#f3a2a2] hover:text-[#ffd2d2]"
                    : "text-[#a9b8cf] hover:text-white"
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
                className={`hover:bg-[#22334f] ${
                  voiceSessionState.isDeafened
                    ? "text-[#f3a2a2] hover:text-[#ffd2d2]"
                    : "text-[#a9b8cf] hover:text-white"
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
            className="text-[#f0b0b0] hover:bg-[#3b2535] hover:text-[#ffd1d1]"
            aria-label="Leave voice"
          >
            <PhoneOff className="size-4" />
          </Button>
          <div className="ml-auto text-[11px] text-[#95a5bf]">
            {participantCount} in call
          </div>
        </div>

        <div className="mt-3 flex min-h-5 items-center gap-1 pl-0.5">
          {participantPreview.slice(0, 4).map((participant) => {
            const initial =
              participant.displayName.trim().charAt(0).toUpperCase() || "?";
            return (
              <span
                key={participant.userId}
                title={participant.displayName}
                className="size-5 rounded-full bg-[#304867] text-[10px] font-semibold text-white flex items-center justify-center"
              >
                {initial}
              </span>
            );
          })}
          {participantPreview.length > 4 && (
            <span className="size-5 rounded-full bg-[#22334f] text-[10px] font-semibold text-[#d1dff4] flex items-center justify-center">
              +{participantPreview.length - 4}
            </span>
          )}
          {participantPreview.length === 0 && (
            <span className="text-[11px] text-[#90a5c4]">
              Waiting for participants.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
