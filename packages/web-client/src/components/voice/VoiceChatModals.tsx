import React from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@platform/lib/errors";
import { VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL } from "@shared/infrastructure/constants";
import { VoiceHardwareDebugPanel } from "@web-client/components/voice/VoiceHardwareDebugPanel";
import { VoiceSettingsModal } from "@web-client/components/voice/VoiceSettingsModal";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";
import type {
  VoiceSessionControllerState,
  VoiceSessionControllerActions,
  VoiceParticipant,
} from "@shared/features/voice/types";

type VoiceSessionApi = {
  state: VoiceSessionControllerState;
  actions: VoiceSessionControllerActions;
};

type VoiceChatModalsProps = {
  voiceSession: VoiceSessionApi;
  visibleActiveVoiceParticipants: VoiceParticipant[];
  canOpenVoicePopout: boolean;
  canKickVoiceParticipants: boolean;
  handleOpenVoicePopout: () => void;
  handleKickVoiceParticipant: (
    targetUserId: string,
    displayName: string,
  ) => Promise<void>;
};

export function VoiceChatModals({
  voiceSession,
  visibleActiveVoiceParticipants,
  canOpenVoicePopout,
  canKickVoiceParticipants,
  handleOpenVoicePopout,
  handleKickVoiceParticipant,
}: VoiceChatModalsProps) {
  const app = useChatAppSession();
  const {
    showVoiceSettingsModal,
    setShowVoiceSettingsModal,
    userVoiceHardwareTestOpen,
    setUserVoiceHardwareTestOpen,
  } = useChatAppModalUiState();
  return (
    <>
      {app.voiceHardwareDebugPanelEnabled && (
        <VoiceHardwareDebugPanel
          open={app.voiceHardwareDebugPanelOpen}
          onOpenChange={app.setVoiceHardwareDebugPanelOpen}
          hotkeyLabel={VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL}
        />
      )}

      {showVoiceSettingsModal && (
        <VoiceSettingsModal
          open={showVoiceSettingsModal}
          onOpenChange={setShowVoiceSettingsModal}
          settings={app.appSettings.voice}
          saving={app.voiceSettingsSaving}
          error={app.voiceSettingsError}
          activeChannelName={app.activeVoiceChannel?.name ?? null}
          currentUserDisplayName={app.userDisplayName}
          currentUserAvatarUrl={app.profileAvatarUrl}
          voiceSessionState={{
            ...voiceSession.state,
            participants: visibleActiveVoiceParticipants,
          }}
          voiceSessionActions={voiceSession.actions}
          showDiagnostics={app.isPlatformStaff}
          canOpenVoicePopout={canOpenVoicePopout}
          canKickParticipants={canKickVoiceParticipants}
          onDisconnect={() => {
            void app.disconnectVoiceSession();
          }}
          onOpenVoicePopout={handleOpenVoicePopout}
          onOpenVoiceHardwareTest={() => setUserVoiceHardwareTestOpen(true)}
          onKickParticipant={(targetUserId, displayName) => {
            void handleKickVoiceParticipant(targetUserId, displayName).catch(
              (error: unknown) => {
                toast.error(
                  getErrorMessage(
                    error,
                    "Failed to remove member from the voice channel.",
                  ),
                  {
                    id: "voice-kick-error",
                  },
                );
              },
            );
          }}
        />
      )}
      {userVoiceHardwareTestOpen && (
        <VoiceHardwareDebugPanel
          open={userVoiceHardwareTestOpen}
          onOpenChange={setUserVoiceHardwareTestOpen}
          hotkeyLabel={null}
          title="Voice Hardware Test"
          description="Test microphone capture and speaker playback locally before joining a voice channel."
          showDebugWorkflow={false}
        />
      )}
    </>
  );
}
