import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { VoicePopoutState } from "@shared/infrastructure/platform/desktop/types";
import { getAppHost } from "@shared/infrastructure/platform/appHost";
import { getErrorMessage } from "@platform/lib/errors";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useLiveKitVoiceSession } from "@web-client/features/voice/useLiveKitVoiceSession";
import { useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import {
  filterBlockedUsersFromParticipantList,
  filterBlockedUsersFromParticipantRecord,
} from "@shared/features/voice/utils/voiceParticipantVisibility";

export function useChatAppVoiceIntegration() {
  const app = useChatAppSession();
  const core = useHavenCore();
  const currentServerId = core.communities.useActiveId();
  const currentServer = useMemo(
    () => app.servers.find((server) => server.id === currentServerId) ?? null,
    [app.servers, currentServerId],
  );
  const voiceSession = core.voice.useSession();
  const voiceJoined = voiceSession.joined;
  const voiceMuted = voiceSession.isMuted;
  const voiceDeafened = voiceSession.isDeafened;
  const blockedUserIds = core.social.useBlockedUserIds();
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const canKickVoiceParticipants =
    serverPermissions.isOwner ||
    serverPermissions.canManageServer ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans;

  const voicePopoutBridge = getAppHost().voicePopout;
  const canOpenVoicePopout =
    getAppHost().isDesktopApp() && Boolean(voicePopoutBridge);
  const [voicePopoutState, setVoicePopoutState] =
    useState<VoicePopoutState | null>(null);
  const setVoicePanelOpen = app.setVoicePanelOpen;
  const disconnectVoiceSession = app.disconnectVoiceSession;
  const activeVoiceServer = app.activeVoiceChannel
    ? (app.servers.find(
        (server) => server.id === app.activeVoiceChannel?.community_id,
      ) ?? null)
    : null;
  const activeVoiceControllerChannel = useMemo(
    () =>
      app.activeVoiceChannel
        ? {
            communityId: app.activeVoiceChannel.community_id,
            channelId: app.activeVoiceChannel.id,
            channelName: app.activeVoiceChannel.name,
          }
        : null,
    [app.activeVoiceChannel],
  );
  const handleVoiceSessionError = useCallback(
    (message: string) => {
      toast.error(message);
      void disconnectVoiceSession({ triggerPaneLeave: false }).catch(
        (error: unknown) => {
          console.error("Failed to reset voice session after error:", error);
        },
      );
    },
    [disconnectVoiceSession],
  );
  const handleVoiceKickReceived = useCallback(() => {
    void app
      .forceDisconnectVoice("kicked")
      .then(() => {
        app.showVoiceDisconnectToast({ reason: "kicked" });
      })
      .catch((error: unknown) => {
        console.error("Failed to force disconnect voice after kick:", error);
      });
  }, [app]);
  const visibleVoiceChannelParticipants = useMemo(
    () =>
      filterBlockedUsersFromParticipantRecord(
        app.voiceChannelParticipants,
        blockedUserIds,
        app.isCurrentUserElevatedInCurrentServer,
      ),
    [
      blockedUserIds,
      app.isCurrentUserElevatedInCurrentServer,
      app.voiceChannelParticipants,
    ],
  );
  const visibleActiveVoiceParticipantPreview = useMemo(
    () =>
      app.activeVoiceChannel
        ? filterBlockedUsersFromParticipantList(
            app.voiceChannelParticipants[app.activeVoiceChannel.id] ?? [],
            blockedUserIds,
            app.isCurrentUserElevatedInActiveVoiceServer,
          )
        : [],
    [
      app.activeVoiceChannel,
      blockedUserIds,
      app.isCurrentUserElevatedInActiveVoiceServer,
      app.voiceChannelParticipants,
    ],
  );
  const handleParticipantsChange = useCallback(
    (
      participants: Array<{
        userId: string;
        displayName: string;
        avatarUrl?: string | null;
        isSpeaking?: boolean;
      }>,
    ) => {
      core.voice.setParticipants(participants);
    },
    [core],
  );
  const handleConnectionChange = useCallback(
    (connected: boolean) => {
      core.voice.setVoiceConnected(connected);
    },
    [core],
  );
  const handleSessionStateChange = useCallback(
    (state: { joined: boolean; isMuted: boolean; isDeafened: boolean }) => {
      core.voice.setSessionState(state);
    },
    [core],
  );
  const handleUpdateVoiceSettings = useCallback(
    (next: Parameters<typeof app.setVoiceSettings>[0]) => {
      void app.setVoiceSettings(next);
    },
    [app.setVoiceSettings],
  );
  const { state: voiceControllerState, actions: voiceControllerActions, livekitRoom } = useLiveKitVoiceSession({
    activeChannel: activeVoiceControllerChannel,
    currentUserId: app.user?.id,
    currentUserDisplayName: app.userDisplayName,
    currentUserAvatarUrl: app.profileAvatarUrl,
    isElevatedInActiveServer: app.isCurrentUserElevatedInActiveVoiceServer,
    voiceSettings: app.appSettings.voice,
    notificationAudioSettings: app.appSettings.notifications,
    showDiagnostics: app.isPlatformStaff,
    onUpdateVoiceSettings: handleUpdateVoiceSettings,
    onParticipantsChange: handleParticipantsChange,
    onConnectionChange: handleConnectionChange,
    onSessionStateChange: handleSessionStateChange,
    onControlActionsReady: app.setVoiceControlActions,
    onSessionError: handleVoiceSessionError,
    onVoiceKick: handleVoiceKickReceived,
  });
  // Reconstitute voiceController shape for downstream usage
  const voiceController = { state: voiceControllerState, actions: voiceControllerActions };
  const visibleActiveVoiceParticipants = useMemo(
    () =>
      filterBlockedUsersFromParticipantList(
        voiceController.state.participants,
        blockedUserIds,
        app.isCurrentUserElevatedInActiveVoiceServer,
      ),
    [
      blockedUserIds,
      app.isCurrentUserElevatedInActiveVoiceServer,
      voiceController.state.participants,
    ],
  );
  const voicePopoutWindowOpen =
    canOpenVoicePopout && Boolean(voicePopoutState?.isOpen);

  useEffect(() => {
    if (!canOpenVoicePopout || !voicePopoutBridge) return;

    return voicePopoutBridge.onVoicePopoutState((nextState) => {
      setVoicePopoutState(nextState);
    });
  }, [canOpenVoicePopout, voicePopoutBridge]);

  useEffect(() => {
    if (!voicePopoutWindowOpen) return;
    setVoicePanelOpen(false);
  }, [setVoicePanelOpen, voicePopoutWindowOpen]);

  useEffect(() => {
    if (!canOpenVoicePopout || !voicePopoutBridge) return;

    void voicePopoutBridge
      .syncVoicePopoutState({
        isOpen: voicePopoutWindowOpen,
        serverName: activeVoiceServer?.name ?? currentServer?.name ?? null,
        channelName: app.activeVoiceChannel?.name ?? null,
        connected: voiceJoined,
        joined: voiceJoined,
        joining: voiceController.state.joining,
        isMuted: voiceMuted,
        isDeafened: voiceDeafened,
        transmissionMode: app.appSettings.voice.transmissionMode,
        participantCount:
          visibleActiveVoiceParticipants.length + (voiceJoined ? 1 : 0),
        selectedInputDeviceId: voiceController.state.selectedInputDeviceId,
        selectedOutputDeviceId: voiceController.state.selectedOutputDeviceId,
        inputDevices: voiceController.state.inputDevices.map(
          (device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          }),
        ),
        outputDevices: voiceController.state.outputDevices.map(
          (device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${index + 1}`,
          }),
        ),
        supportsOutputSelection: voiceController.state.supportsOutputSelection,
        members: visibleActiveVoiceParticipants.map((participant) => {
          const controllerParticipant = voiceController.state.participants.find(
            (entry) => entry.userId === participant.userId,
          );
          return {
            userId: participant.userId,
            displayName: participant.displayName,
            isMuted: controllerParticipant?.muted ?? false,
            isDeafened: controllerParticipant?.deafened ?? false,
            volume:
              voiceController.state.remoteVolumes[participant.userId] ?? 100,
          };
        }),
      })
      .catch((error: unknown) => {
        console.error("Failed to sync voice popout state:", error);
      });
  }, [
    app.activeVoiceChannel,
    app.appSettings.voice.transmissionMode,
    canOpenVoicePopout,
    activeVoiceServer?.name,
    currentServer?.name,
    voiceDeafened,
    voiceJoined,
    voiceMuted,
    visibleActiveVoiceParticipants,
    voicePopoutWindowOpen,
    voiceController.state.joining,
    voiceController.state.inputDevices,
    voiceController.state.outputDevices,
    voiceController.state.participants,
    voiceController.state.remoteVolumes,
    voiceController.state.selectedInputDeviceId,
    voiceController.state.selectedOutputDeviceId,
    voiceController.state.supportsOutputSelection,
    voicePopoutBridge,
  ]);

  useEffect(() => {
    if (!canOpenVoicePopout || !voicePopoutBridge) return;

    return voicePopoutBridge.onVoicePopoutControlAction((action) => {
      switch (action.type) {
        case "toggle_mute":
          voiceController.actions.toggleMute();
          return;
        case "toggle_deafen":
          voiceController.actions.toggleDeafen();
          return;
        case "join_voice":
          void voiceController.actions.joinVoiceChannel();
          return;
        case "leave_voice":
          void disconnectVoiceSession();
          return;
        case "set_transmission_mode":
          voiceController.actions.updateVoiceSettingsPatch({
            transmissionMode: action.mode,
          });
          return;
        case "set_input_device":
          void voiceController.actions.switchInputDevice(action.deviceId);
          return;
        case "set_output_device":
          voiceController.actions.setOutputDevice(action.deviceId);
          return;
        case "set_member_volume":
          voiceController.actions.setMemberVolume(action.userId, action.volume);
          return;
        case "open_voice_settings":
          useUiStore.getState().setShowVoiceSettingsModal(true);
          return;
        case "open_voice_hardware_test":
          useUiStore.getState().setUserVoiceHardwareTestOpen(true);
          return;
        default:
          return;
      }
    });
  }, [
    canOpenVoicePopout,
    disconnectVoiceSession,
    voiceController.actions.setMemberVolume,
    voiceController.actions.setOutputDevice,
    voiceController.actions.switchInputDevice,
    voiceController.actions.joinVoiceChannel,
    voiceController.actions.toggleDeafen,
    voiceController.actions.toggleMute,
    voiceController.actions.updateVoiceSettingsPatch,
    voicePopoutBridge,
  ]);

  const handleOpenVoicePopout = useCallback(() => {
    if (!canOpenVoicePopout || !voicePopoutBridge) return;
    setVoicePanelOpen(false);

    void voicePopoutBridge.openVoicePopout().catch((error: unknown) => {
      toast.error(getErrorMessage(error, "Failed to open voice popout."));
    });
  }, [canOpenVoicePopout, setVoicePanelOpen, voicePopoutBridge]);

  const handleKickVoiceParticipant = useCallback(
    async (targetUserId: string, displayName: string) => {
      if (!canKickVoiceParticipants || !app.activeVoiceChannelId) return;
      await voiceController.actions.kickFromVoice(
        targetUserId,
        app.activeVoiceChannelId,
      );
      toast(`${displayName} has been removed from the voice channel.`, {
        id: `voice-kick:${app.activeVoiceChannelId}:${targetUserId}`,
        action: {
          label: "Dismiss",
          onClick: () => {
            toast.dismiss(
              `voice-kick:${app.activeVoiceChannelId}:${targetUserId}`,
            );
          },
        },
      });
    },
    [
      app.activeVoiceChannelId,
      canKickVoiceParticipants,
      voiceController.actions,
    ],
  );

  return {
    voiceController,
    livekitRoom,
    visibleVoiceChannelParticipants,
    visibleActiveVoiceParticipantPreview,
    visibleActiveVoiceParticipants,
    voicePopoutWindowOpen,
    canOpenVoicePopout,
    handleOpenVoicePopout,
    handleKickVoiceParticipant,
    canKickVoiceParticipants,
    activeVoiceServer,
    voiceJoined,
    voiceMuted,
    voiceDeafened,
  };
}
