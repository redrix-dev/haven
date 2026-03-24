import React from "react";
import type { VoiceSettings } from "@platform/desktop/types";
import type {
  VoiceParticipant,
  VoicePeerDiagnostics,
} from "@client/features/voice/types";
import { Badge } from "@shared/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/components/ui/avatar";
import { Button } from "@shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shared/components/ui/card";
import { PushToTalkBindingField } from "@shared/components/PushToTalkBindingField";
import { Slider } from "@shared/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/components/ui/select";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import { cn } from "@shared/lib/utils";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import {
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  RefreshCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

const REMOTE_VOLUME_OPTIONS = [0, 25, 50, 75, 100, 125, 150, 200] as const;

const formatBytes = (value: number | null) =>
  value == null ? "n/a" : `${(value / 1024).toFixed(1)} KB`;

const getInitials = (displayName: string) => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
};

type VoiceChannelPaneProps = {
  channelName?: string | null;
  joined: boolean;
  joining?: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  participants: VoiceParticipant[];
  currentUserDisplayName: string;
  currentUserAvatarUrl?: string | null;
  voiceSettings: VoiceSettings;
  voiceSettingsSaving?: boolean;
  voiceSettingsError?: string | null;
  notice?: string | null;
  error?: string | null;
  iceSource?: "xirsys" | "fallback" | null;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  switchingInput?: boolean;
  supportsOutputSelection?: boolean;
  localInputLevel: number;
  voiceActivityGateOpen: boolean;
  pushToTalkPressed: boolean;
  showDiagnostics?: boolean;
  diagnosticsRows?: VoicePeerDiagnostics[];
  diagnosticsUpdatedAt?: string | null;
  diagnosticsLoading?: boolean;
  canOpenVoicePopout?: boolean;
  canKickParticipants?: boolean;
  onUpdateVoiceSettingsPatch?: (patch: Partial<VoiceSettings>) => void;
  onOpenVoiceHardwareTest?: () => void;
  onOpenVoicePopout?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onRetryIce?: () => void;
  onRefreshDiagnostics?: () => void;
  onSelectInputDevice?: (deviceId: string) => void;
  onSelectOutputDevice?: (deviceId: string) => void;
  setMemberVolume: (userId: string, volume: number) => void;
  resetMemberVolume: (userId: string) => void;
  resetAllMemberVolumes: () => void;
  getMemberVolume: (userId: string) => number;
  onKickParticipant?: (targetUserId: string, displayName: string) => void;
};

export function VoiceChannelPane({
  channelName = null,
  joined,
  joining = false,
  isMuted,
  isDeafened,
  participants,
  currentUserDisplayName,
  currentUserAvatarUrl,
  voiceSettings,
  voiceSettingsSaving = false,
  voiceSettingsError = null,
  notice = null,
  error = null,
  iceSource = null,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  switchingInput = false,
  supportsOutputSelection = false,
  localInputLevel,
  voiceActivityGateOpen,
  pushToTalkPressed,
  showDiagnostics = false,
  diagnosticsRows = [],
  diagnosticsUpdatedAt = null,
  diagnosticsLoading = false,
  canOpenVoicePopout = false,
  canKickParticipants = false,
  onUpdateVoiceSettingsPatch,
  onOpenVoiceHardwareTest,
  onOpenVoicePopout,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onRetryIce,
  onRefreshDiagnostics,
  onSelectInputDevice,
  onSelectOutputDevice,
  setMemberVolume,
  resetMemberVolume,
  resetAllMemberVolumes,
  getMemberVolume,
  onKickParticipant,
}: VoiceChannelPaneProps) {
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const updateVoiceSettingsPatch = (patch: Partial<VoiceSettings>) => {
    onUpdateVoiceSettingsPatch?.(patch);
  };

  return (
    <div className="scrollbar-inset flex flex-col gap-4 overflow-y-auto p-4">
      <Card className="border-[#263a58] bg-[#1c2a43] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="size-5" />
            <span>{channelName ?? "Voice Controls"}</span>
          </CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Advanced voice routing, diagnostics, and local per-member volume
            controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={joined ? "default" : "outline"}>
              {joined ? "Connected" : channelName ? "Disconnected" : "Idle"}
            </Badge>
            {iceSource && (
              <Badge variant={iceSource === "xirsys" ? "default" : "outline"}>
                ICE: {iceSource === "xirsys" ? "Xirsys" : "STUN fallback"}
              </Badge>
            )}
          </div>

          {notice && <p className="text-sm text-amber-300">{notice}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!channelName && (
            <p className="text-sm text-[#a9b8cf]">
              Join a voice channel to view live peers, diagnostics, and member
              volume controls.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!joined ? (
              <Button
                type="button"
                onClick={onJoin}
                disabled={!channelName || joining}
                className="bg-[#3f79d8] text-white hover:bg-[#325fae]"
              >
                <PhoneCall className="size-4" />
                {joining ? "Joining..." : "Join Voice"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onToggleMute}
                  className={`text-white ${
                    isMuted
                      ? "border-red-500/40 bg-red-500/15 hover:bg-red-500/20"
                      : "border-[#304867] bg-[#142033] hover:bg-[#22334f]"
                  }`}
                >
                  {isMuted ? (
                    <MicOff className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onToggleDeafen}
                  className={`text-white ${
                    isDeafened
                      ? "border-red-500/40 bg-red-500/15 hover:bg-red-500/20"
                      : "border-[#304867] bg-[#142033] hover:bg-[#22334f]"
                  }`}
                >
                  <VolumeX className="size-4" />
                  {isDeafened ? "Undeafen" : "Deafen"}
                </Button>
                <Button type="button" variant="outline" onClick={onRetryIce}>
                  <RefreshCcw className="size-4" />
                  Retry ICE
                </Button>
                <Button type="button" variant="outline" onClick={onLeave}>
                  <PhoneOff className="size-4" />
                  Leave Voice
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {onOpenVoiceHardwareTest && (
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenVoiceHardwareTest}
              >
                Open Voice Hardware Test
              </Button>
            )}
            {canOpenVoicePopout && onOpenVoicePopout && (
              <Button
                type="button"
                variant="outline"
                onClick={onOpenVoicePopout}
              >
                <ExternalLink className="size-4" />
                Open Voice Popout
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#263a58] bg-[#1c2a43] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            <span>Voice Transmission</span>
          </CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Adjust how your microphone transmits while unmuted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Mode: {voiceSettings.transmissionMode.replace(/_/g, " ")}
            </Badge>
            {voiceSettings.transmissionMode === "voice_activity" && (
              <Badge variant={voiceActivityGateOpen ? "default" : "outline"}>
                Gate {voiceActivityGateOpen ? "Open" : "Closed"}
              </Badge>
            )}
            {voiceSettings.transmissionMode === "push_to_talk" && (
              <Badge variant={pushToTalkPressed ? "default" : "outline"}>
                PTT {pushToTalkPressed ? "Held" : "Idle"}
              </Badge>
            )}
            <Badge variant="outline">
              Input {Math.round(localInputLevel * 100)}%
            </Badge>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Transmission mode
            </p>
            <Select
              value={voiceSettings.transmissionMode}
              onValueChange={(value) =>
                updateVoiceSettingsPatch({
                  transmissionMode: value as VoiceSettings["transmissionMode"],
                })
              }
              disabled={voiceSettingsSaving}
            >
              <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent className="border-[#304867] bg-[#142033] text-white">
                <SelectItem value="voice_activity">Voice Activity</SelectItem>
                <SelectItem value="push_to_talk">Push to Talk</SelectItem>
                <SelectItem value="open_mic">Open Mic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {voiceSettings.transmissionMode === "voice_activity" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                <span>Gate threshold</span>
                <span>{voiceSettings.voiceActivationThreshold}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[voiceSettings.voiceActivationThreshold]}
                onValueChange={(values) => {
                  const nextValue = values[0];
                  if (typeof nextValue !== "number") return;
                  updateVoiceSettingsPatch({
                    voiceActivationThreshold: nextValue,
                  });
                }}
                disabled={voiceSettingsSaving}
                className="w-full py-1"
                aria-label="Voice activity gate threshold"
              />
            </div>
          )}

          {voiceSettings.transmissionMode === "push_to_talk" && (
            <PushToTalkBindingField
              value={voiceSettings.pushToTalkBinding}
              disabled={voiceSettingsSaving}
              onChange={(nextBinding) =>
                updateVoiceSettingsPatch({ pushToTalkBinding: nextBinding })
              }
              helperText="Push-to-talk works while Haven is focused."
            />
          )}

          {voiceSettingsError && (
            <p className="text-sm text-red-300">{voiceSettingsError}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#263a58] bg-[#1c2a43] text-white">
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Select microphone and speaker devices. Input switching applies live
            while connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Microphone
            </p>
            <Select
              value={selectedInputDeviceId}
              onValueChange={(value) => void onSelectInputDevice?.(value)}
            >
              <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent className="border-[#304867] bg-[#142033] text-white">
                {inputDevices.length === 0 ? (
                  <SelectItem value="default">Default microphone</SelectItem>
                ) : (
                  inputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {switchingInput && (
              <p className="text-xs text-[#a9b8cf]">Switching microphone...</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Speaker
            </p>
            <Select
              value={selectedOutputDeviceId}
              onValueChange={(value) => onSelectOutputDevice?.(value)}
              disabled={!supportsOutputSelection}
            >
              <SelectTrigger className="w-full border-[#304867] bg-[#142033] text-white">
                <SelectValue placeholder="Select speaker" />
              </SelectTrigger>
              <SelectContent className="border-[#304867] bg-[#142033] text-white">
                {outputDevices.length === 0 ? (
                  <SelectItem value="default">Default speaker</SelectItem>
                ) : (
                  outputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${index + 1}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!supportsOutputSelection && (
              <p className="text-xs text-[#a9b8cf]">
                Output selection is not supported by this runtime. Your system
                default speaker is used.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {showDiagnostics && (
        <Card className="border-[#263a58] bg-[#1c2a43] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Voice Diagnostics</span>
              <Badge variant="outline">Staff only</Badge>
            </CardTitle>
            <CardDescription className="text-[#a9b8cf]">
              Live WebRTC state and selected ICE route details for debugging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#a9b8cf]">
              <span>Peers: {diagnosticsRows.length}</span>
              <span>
                ICE source:{" "}
                {iceSource === "xirsys" ? "xirsys" : (iceSource ?? "unknown")}
              </span>
              <span>
                Last refresh:{" "}
                {diagnosticsUpdatedAt
                  ? new Date(diagnosticsUpdatedAt).toLocaleTimeString()
                  : "never"}
              </span>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                onClick={onRefreshDiagnostics}
                disabled={!joined || diagnosticsLoading}
              >
                <RefreshCcw className="size-4" />
                {diagnosticsLoading ? "Refreshing..." : "Refresh Diagnostics"}
              </Button>
            </div>

            {!joined ? (
              <p className="text-sm text-[#a9b8cf]">
                Join voice to view diagnostics.
              </p>
            ) : diagnosticsRows.length === 0 ? (
              <p className="text-sm text-[#a9b8cf]">No peer connections yet.</p>
            ) : (
              <div className="space-y-2">
                {diagnosticsRows.map((diag) => (
                  <details
                    key={diag.userId}
                    className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2"
                  >
                    <summary className="cursor-pointer text-sm font-medium text-white">
                      {diag.displayName} ({diag.connectionState})
                    </summary>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-[#a9b8cf] md:grid-cols-2">
                      <p>Connection: {diag.connectionState}</p>
                      <p>ICE connection: {diag.iceConnectionState}</p>
                      <p>Signaling: {diag.signalingState}</p>
                      <p>ICE gathering: {diag.iceGatheringState}</p>
                      <p>Pair ID: {diag.selectedCandidatePairId ?? "n/a"}</p>
                      <p>
                        Pair state: {diag.selectedCandidatePairState ?? "n/a"}
                      </p>
                      <p>Local candidate: {diag.localCandidateType ?? "n/a"}</p>
                      <p>
                        Remote candidate: {diag.remoteCandidateType ?? "n/a"}
                      </p>
                      <p>
                        Writable:{" "}
                        {diag.writable == null
                          ? "n/a"
                          : diag.writable
                            ? "yes"
                            : "no"}
                      </p>
                      <p>Bytes sent: {formatBytes(diag.bytesSent)}</p>
                      <p>Bytes received: {formatBytes(diag.bytesReceived)}</p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-[#263a58] bg-[#1c2a43] text-white">
        <CardHeader>
          <CardTitle>
            Participants ({participants.length + (joined ? 1 : 0)})
          </CardTitle>
          <CardDescription className="text-[#a9b8cf]">
            Per-user volume is local to this client.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {joined && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  size="sm"
                  className={cn(
                    "ring-2 ring-transparent transition-colors",
                    voiceActivityGateOpen &&
                      !isMuted &&
                      !isDeafened &&
                      "ring-[#64f0a8]",
                  )}
                >
                  <AvatarImage
                    src={currentUserAvatarUrl ?? undefined}
                    alt={currentUserDisplayName}
                  />
                  <AvatarFallback>
                    {getInitials(currentUserDisplayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {currentUserDisplayName} (You)
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {isMuted && <Badge variant="outline">Muted</Badge>}
                    {isDeafened && <Badge variant="outline">Deafened</Badge>}
                  </div>
                </div>
              </div>
              <Badge variant="secondary">Local</Badge>
            </div>
          )}

          {participants.length === 0 ? (
            <p className="text-sm text-[#a9b8cf]">
              No other participants are connected.
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetAllMemberVolumes}
                  className="h-8 text-xs text-[#c8d7ee] hover:text-white"
                  disabled={isDeafened}
                >
                  <RefreshCcw className="mr-1.5 size-3.5" />
                  Reset all member volumes
                </Button>
              </div>

              {participants.map((participant) => {
                const participantDisplayName =
                  resolveLiveUsername(
                    liveProfiles,
                    participant.userId,
                    participant.displayName,
                  ) ?? participant.displayName;
                const participantAvatarUrl = resolveLiveAvatarUrl(
                  liveProfiles,
                  participant.userId,
                  participant.avatarUrl,
                );

                return (
                  <div
                    key={participant.userId}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#304867] bg-[#142033] px-3 py-2"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <Avatar
                        size="sm"
                        className={cn(
                          "ring-2 ring-transparent transition-colors",
                          participant.isSpeaking && "ring-[#64f0a8]",
                        )}
                      >
                        <AvatarImage
                          src={participantAvatarUrl ?? undefined}
                          alt={participantDisplayName}
                        />
                        <AvatarFallback>
                          {getInitials(participantDisplayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-medium text-white"
                          title={participantDisplayName}
                        >
                          {participantDisplayName}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {participant.muted && (
                            <Badge variant="outline">Muted</Badge>
                          )}
                          {participant.deafened && (
                            <Badge variant="outline">Deafened</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[220px] items-center gap-3">
                      <Volume2 className="size-4 text-[#a9b8cf]" />
                      <Slider
                        min={REMOTE_VOLUME_OPTIONS[0]}
                        max={
                          REMOTE_VOLUME_OPTIONS[
                            REMOTE_VOLUME_OPTIONS.length - 1
                          ]
                        }
                        step={25}
                        value={[getMemberVolume(participant.userId)]}
                        onValueChange={(values) => {
                          const numericValue = values[0];
                          if (typeof numericValue !== "number") return;
                          setMemberVolume(participant.userId, numericValue);
                        }}
                        disabled={isDeafened}
                        className="w-full"
                        aria-label={`Volume for ${participantDisplayName}`}
                      />
                      <span className="w-10 shrink-0 text-right text-xs text-[#c8d7ee]">
                        {getMemberVolume(participant.userId)}%
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => resetMemberVolume(participant.userId)}
                        disabled={isDeafened}
                        className="h-8 px-2 text-xs"
                      >
                        100%
                      </Button>
                      {canKickParticipants && onKickParticipant && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onKickParticipant(
                              participant.userId,
                              participantDisplayName,
                            )
                          }
                          className="h-8 border-red-500/40 bg-red-500/10 px-2 text-xs text-red-100 hover:bg-red-500/20"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
