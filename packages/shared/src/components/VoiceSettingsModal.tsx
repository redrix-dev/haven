import React from "react";
import { VoiceChannelPane } from "@shared/components/VoiceChannelPane";
import { Button } from "@shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import type { VoiceSessionControllerActions } from "@client/features/voice/types";
import type { VoiceSessionControllerState } from "@client/features/voice/types";
import type { VoiceSettings } from "@platform/desktop/types";

type VoiceSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: VoiceSettings;
  saving: boolean;
  error?: string | null;
  activeChannelName: string | null;
  currentUserDisplayName: string;
  currentUserAvatarUrl?: string | null;
  voiceSessionState: VoiceSessionControllerState;
  voiceSessionActions: VoiceSessionControllerActions;
  showDiagnostics?: boolean;
  canOpenVoicePopout?: boolean;
  canKickParticipants?: boolean;
  onDisconnect?: () => void;
  onOpenVoicePopout?: () => void;
  onOpenVoiceHardwareTest?: () => void;
  onKickParticipant?: (targetUserId: string, displayName: string) => void;
};

export function VoiceSettingsModal({
  open,
  onOpenChange,
  settings,
  saving,
  error = null,
  activeChannelName,
  currentUserDisplayName,
  currentUserAvatarUrl,
  voiceSessionState,
  voiceSessionActions,
  showDiagnostics = false,
  canOpenVoicePopout = false,
  canKickParticipants = false,
  onDisconnect,
  onOpenVoicePopout,
  onOpenVoiceHardwareTest,
  onKickParticipant,
}: VoiceSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        className="max-h-[90vh] bg-[#18243a] border-[#142033] text-white md:w-[min(94vw,1040px)] md:max-w-none min-h-0 flex flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-2xl font-bold text-white">
            Voice Settings
          </DialogTitle>
          <DialogDescription className="text-sm text-[#9fb2cf]">
            {activeChannelName
              ? "Advanced controls for the active voice session. The sidebar footer stays compact and only exposes quick actions."
              : "Configure voice devices, transmission defaults, and diagnostics before you join a channel."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <VoiceChannelPane
            channelName={activeChannelName}
            joined={voiceSessionState.joined}
            joining={voiceSessionState.joining}
            isMuted={voiceSessionState.isMuted}
            isDeafened={voiceSessionState.isDeafened}
            participants={voiceSessionState.participants}
            currentUserDisplayName={currentUserDisplayName}
            currentUserAvatarUrl={currentUserAvatarUrl}
            voiceSettings={settings}
            voiceSettingsSaving={saving}
            voiceSettingsError={error}
            notice={voiceSessionState.notice}
            error={voiceSessionState.error}
            iceSource={voiceSessionState.iceSource}
            inputDevices={voiceSessionState.inputDevices}
            outputDevices={voiceSessionState.outputDevices}
            selectedInputDeviceId={voiceSessionState.selectedInputDeviceId}
            selectedOutputDeviceId={voiceSessionState.selectedOutputDeviceId}
            switchingInput={voiceSessionState.switchingInput}
            supportsOutputSelection={voiceSessionState.supportsOutputSelection}
            localInputLevel={voiceSessionState.localInputLevel}
            voiceActivityGateOpen={voiceSessionState.voiceActivityGateOpen}
            pushToTalkPressed={voiceSessionState.pushToTalkPressed}
            showDiagnostics={showDiagnostics}
            diagnosticsRows={voiceSessionState.diagnosticsRows}
            diagnosticsUpdatedAt={voiceSessionState.diagnosticsUpdatedAt}
            diagnosticsLoading={voiceSessionState.diagnosticsLoading}
            canOpenVoicePopout={canOpenVoicePopout}
            canKickParticipants={canKickParticipants}
            onUpdateVoiceSettingsPatch={
              voiceSessionActions.updateVoiceSettingsPatch
            }
            onOpenVoiceHardwareTest={onOpenVoiceHardwareTest}
            onOpenVoicePopout={onOpenVoicePopout}
            onJoin={() => {
              void voiceSessionActions.joinVoiceChannel();
            }}
            onLeave={onDisconnect}
            onToggleMute={voiceSessionActions.toggleMute}
            onToggleDeafen={voiceSessionActions.toggleDeafen}
            onRetryIce={() => {
              void voiceSessionActions.retryIce();
            }}
            onRefreshDiagnostics={() => {
              void voiceSessionActions.refreshVoiceDiagnostics();
            }}
            onSelectInputDevice={(deviceId) => {
              void voiceSessionActions.switchInputDevice(deviceId);
            }}
            onSelectOutputDevice={voiceSessionActions.setOutputDevice}
            setMemberVolume={voiceSessionActions.setMemberVolume}
            resetMemberVolume={voiceSessionActions.resetMemberVolume}
            resetAllMemberVolumes={voiceSessionActions.resetAllMemberVolumes}
            getMemberVolume={voiceSessionActions.getMemberVolume}
            onKickParticipant={onKickParticipant}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="text-white hover:underline"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
