import React from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@platform/lib/errors";
import { VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL } from "@shared/app/constants";
import { VoiceHardwareDebugPanel } from "@shared/features/voice/components/VoiceHardwareDebugPanel";
import { VoiceSettingsModal } from "@shared/features/voice/components/VoiceSettingsModal";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";
import { useVoiceSessionController } from "@shared/features/voice/hooks/useVoiceSessionController";

type VoiceSessionApi = ReturnType<typeof useVoiceSessionController>;

type VoiceChatModalsProps = {
  app: ChatAppOrchestrationApi;
  ui: Pick<
    ChatAppModalUiState,
    | "showVoiceSettingsModal"
    | "setShowVoiceSettingsModal"
    | "userVoiceHardwareTestOpen"
    | "setUserVoiceHardwareTestOpen"
  >;
  voiceSession: VoiceSessionApi;
  visibleActiveVoiceParticipants: VoiceSessionApi["state"]["participants"];
  canOpenVoicePopout: boolean;
  canKickVoiceParticipants: boolean;
  handleOpenVoicePopout: () => void;
  handleKickVoiceParticipant: (
    targetUserId: string,
    displayName: string,
  ) => Promise<void>;
};

export function VoiceChatModals({
  app,
  ui: {
    showVoiceSettingsModal,
    setShowVoiceSettingsModal,
    userVoiceHardwareTestOpen,
    setUserVoiceHardwareTestOpen,
  },
  voiceSession,
  visibleActiveVoiceParticipants,
  canOpenVoicePopout,
  canKickVoiceParticipants,
  handleOpenVoicePopout,
  handleKickVoiceParticipant,
}: VoiceChatModalsProps) {
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
