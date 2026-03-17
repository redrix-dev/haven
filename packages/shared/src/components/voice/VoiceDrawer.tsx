import React from "react";
import { Button } from "@shared/components/ui/button";
import { VoiceChannelPane } from "@shared/components/VoiceChannelPane";
import type {
  VoiceSettings,
  NotificationAudioSettings,
} from "@platform/desktop/types";
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  VolumeX,
} from "lucide-react";

interface VoiceDrawerProps {
  communityId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
  currentUserDisplayName: string;
  notificationAudioSettings: NotificationAudioSettings;
  participantCount: number;
  participantPreview: Array<{ userId: string; displayName: string }>;
  voiceConnected: boolean;
  voicePanelOpen: boolean;
  voiceSessionState: {
    joined: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  };
  voiceControlActions: {
    join: () => void;
    leave: () => void;
    toggleMute: () => void;
    toggleDeafen: () => void;
  } | null;
  voiceSettings: VoiceSettings;
  voiceSettingsSaving?: boolean;
  voiceSettingsError?: string | null;
  showDiagnostics?: boolean;
  onToggleOpen: () => void;
  onDisconnect: () => void;
  onUpdateVoiceSettings: (next: VoiceSettings) => void;
  onOpenAdvancedOptions: () => void;
  onOpenVoiceHardwareTest: () => void;
  onParticipantsChange: (
    participants: Array<{ userId: string; displayName: string }>,
  ) => void;
  onConnectionChange: (connected: boolean) => void;
  onSessionStateChange: (state: {
    joined: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  }) => void;
  onControlActionsReady: (
    actions: {
      join: () => void;
      leave: () => void;
      toggleMute: () => void;
      toggleDeafen: () => void;
    } | null,
  ) => void;
}

export function VoiceDrawer({
  communityId,
  serverName,
  channelId,
  channelName,
  currentUserId,
  currentUserDisplayName,
  participantCount,
  participantPreview,
  voiceConnected,
  voicePanelOpen,
  voiceSessionState,
  voiceControlActions,
  voiceSettings,
  voiceSettingsSaving = false,
  voiceSettingsError = null,
  showDiagnostics = false,
  onToggleOpen,
  onDisconnect,
  onUpdateVoiceSettings,
  onOpenAdvancedOptions,
  onOpenVoiceHardwareTest,
  onParticipantsChange,
  onConnectionChange,
  onSessionStateChange,
  onControlActionsReady,
  notificationAudioSettings,
}: VoiceDrawerProps) {
  return (
    <div className="px-2 pt-2 pb-1 border-b border-[#22334f]">
      <div className="rounded-md border border-[#304867] bg-[#142033] px-2 py-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">
              Voice Connected
            </p>
            <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
              <Headphones className="size-3.5" />
              {channelName}
            </p>
            <p className="text-[11px] text-[#95a5bf] truncate">{serverName}</p>
          </div>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              voiceConnected
                ? "bg-[#2f9f73]/20 text-[#6dd5a6]"
                : "bg-[#44546f]/40 text-[#b5c4de]"
            }`}
          >
            {voiceConnected ? "Live" : "Connecting"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {!voiceSessionState.joined ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => voiceControlActions?.join()}
              disabled={!voiceControlActions}
              className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
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
                onClick={() => voiceControlActions?.toggleMute()}
                disabled={!voiceControlActions}
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
                onClick={() => voiceControlActions?.toggleDeafen()}
                disabled={!voiceControlActions}
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
            onClick={onToggleOpen}
            className={`hover:text-white hover:bg-[#22334f] ${
              voicePanelOpen ? "text-white" : "text-[#a9b8cf]"
            }`}
            aria-label={
              voicePanelOpen ? "Collapse voice drawer" : "Expand voice drawer"
            }
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onDisconnect}
            className="text-[#f0b0b0] hover:text-[#ffd1d1] hover:bg-[#3b2535]"
            aria-label="Leave voice"
          >
            <PhoneOff className="size-4" />
          </Button>
          <div className="ml-auto text-[11px] text-[#95a5bf]">
            {participantCount} in call
          </div>
        </div>

        <div className="flex items-center gap-1 pl-0.5">
          {participantPreview.slice(0, 4).map((participant) => {
            const initial =
              participant.displayName.trim().charAt(0).toUpperCase() || "?";
            return (
              <span
                key={participant.userId}
                title={participant.displayName}
                className="size-5 rounded-full bg-[#304867] text-[10px] text-white font-semibold flex items-center justify-center"
              >
                {initial}
              </span>
            );
          })}
          {participantPreview.length > 4 && (
            <span className="size-5 rounded-full bg-[#22334f] text-[10px] text-[#d1dff4] font-semibold flex items-center justify-center">
              +{participantPreview.length - 4}
            </span>
          )}
        </div>

        {voicePanelOpen && (
          <div className="rounded-md border border-[#22334f] bg-[#111a2b] overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto scrollbar-inset p-2">
              <VoiceChannelPane
                notificationAudioSettings={notificationAudioSettings}
                key={`${communityId}:${channelId}`}
                communityId={communityId}
                channelId={channelId}
                channelName={channelName}
                currentUserId={currentUserId}
                currentUserDisplayName={currentUserDisplayName}
                voiceSettings={voiceSettings}
                voiceSettingsSaving={voiceSettingsSaving}
                voiceSettingsError={voiceSettingsError}
                onUpdateVoiceSettings={onUpdateVoiceSettings}
                onOpenVoiceSettings={onOpenAdvancedOptions}
                onOpenVoiceHardwareTest={onOpenVoiceHardwareTest}
                showDiagnostics={showDiagnostics}
                autoJoin
                onParticipantsChange={onParticipantsChange}
                onConnectionChange={onConnectionChange}
                onSessionStateChange={onSessionStateChange}
                onControlActionsReady={onControlActionsReady}
                onLeave={onDisconnect}
              />
              <div className="pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onOpenAdvancedOptions}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                >
                  Advanced options
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
