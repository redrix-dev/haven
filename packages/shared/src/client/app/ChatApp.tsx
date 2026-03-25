import React from "react";
import { LoginScreen } from "@shared/components/LoginScreen";
import { ServerList } from "@shared/components/ServerList";
import { CreateServerModal } from "@shared/components/CreateServerModal";
import { CreateChannelModal } from "@shared/components/CreateChannelModal";
import { JoinServerModal } from "@shared/components/JoinServerModal";
import { AccountSettingsModal } from "@shared/components/AccountSettingsModal";
import { QuickRenameDialog } from "@shared/components/QuickRenameDialog";
import { ServerMembersModal } from "@shared/components/ServerMembersModal";
import { ServerSettingsModal } from "@shared/components/ServerSettingsModal";
import { ChannelSettingsModal } from "@shared/components/ChannelSettingsModal";
import { Sidebar } from "@shared/components/Sidebar";
import { ChatArea } from "@shared/components/ChatArea";
import { VoiceHardwareDebugPanel } from "@shared/components/VoiceHardwareDebugPanel";
import { VoiceSettingsModal } from "@shared/components/VoiceSettingsModal";
import { VoiceDrawer } from "@shared/components/voice/VoiceDrawer";
import { NotificationCenterModal } from "@shared/components/NotificationCenterModal";
import { FriendsModal } from "@shared/components/FriendsModal";
import { DirectMessagesSidebar } from "@shared/components/DirectMessagesSidebar";
import { DirectMessageArea } from "@shared/components/DirectMessageArea";
import { ServerModmailPanel } from "@shared/components/ServerModmailPanel";
import { PasswordRecoveryDialog } from "@shared/components/PasswordRecoveryDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/components/ui/alert-dialog";
import { desktopClient } from "@platform/desktop/client";
import { getErrorMessage } from "@platform/lib/errors";
import { VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL } from "@client/app/constants";
import { useChatAppOrchestration } from "@client/app/hooks/useChatAppOrchestration";
import { useVoiceSessionController } from "@client/features/voice/hooks/useVoiceSessionController";
import type { VoicePopoutState } from "@platform/desktop/types";
import { toast } from "sonner";
import { useServerOrder } from "@client/features/community/hooks/useServerOrder";
import { useDmStore } from "@shared/stores/dmStore";
import { useServersStore } from "@shared/stores/serversStore";
import { useVoiceStore } from "@shared/stores/voiceStore";

function hasSameServerIdOrder(
  left: ReadonlyArray<{ id: string }>,
  right: ReadonlyArray<{ id: string }>,
) {
  if (left.length !== right.length) return false;
  return left.every((server, index) => server.id === right[index]?.id);
}

function filterBlockedUsersFromParticipantList<T extends { userId: string }>(
  participants: ReadonlyArray<T>,
  blockedUserIds: ReadonlySet<string>,
  isElevatedViewer: boolean,
) {
  if (isElevatedViewer || blockedUserIds.size === 0) {
    return [...participants];
  }

  return participants.filter((participant) => !blockedUserIds.has(participant.userId));
}

function filterBlockedUsersFromParticipantRecord<T extends { userId: string }>(
  participantsByChannelId: Record<string, T[]>,
  blockedUserIds: ReadonlySet<string>,
  isElevatedViewer: boolean,
) {
  if (isElevatedViewer || blockedUserIds.size === 0) {
    return participantsByChannelId;
  }

  return Object.fromEntries(
    Object.entries(participantsByChannelId).map(([channelId, participants]) => [
      channelId,
      participants.filter((participant) => !blockedUserIds.has(participant.userId)),
    ]),
  ) as Record<string, T[]>;
}

export function ChatApp() {
  const app = useChatAppOrchestration();
  const totalDmUnreadCount = useDmStore((state) =>
    Object.values(state.unreadCounts).reduce((total, count) => total + count, 0),
  );
  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    app.servers,
  );
  // Keep the shared server store aligned with orchestration-selected state and local ordering.
  const setStoredServers = useServersStore((state) => state.setServers);
  const setStoredCurrentServerId = useServersStore(
    (state) => state.setCurrentServerId,
  );
  const setStoredCurrentServer = useServersStore(
    (state) => state.setCurrentServer,
  );
  const voiceJoined = useVoiceStore((state) => state.joined);
  const voiceMuted = useVoiceStore((state) => state.isMuted);
  const voiceDeafened = useVoiceStore((state) => state.isDeafened);
  const canOpenVoicePopout = desktopClient.isAvailable();
  const [voicePopoutState, setVoicePopoutState] =
    React.useState<VoicePopoutState | null>(null);
  const setVoicePanelOpen = app.setVoicePanelOpen;
  const disconnectVoiceSession = app.disconnectVoiceSession;
  const setShowVoiceSettingsModal = app.setShowVoiceSettingsModal;
  const setUserVoiceHardwareTestOpen = app.setUserVoiceHardwareTestOpen;
  const activeVoiceServer = app.activeVoiceChannel
    ? (app.servers.find(
        (server) => server.id === app.activeVoiceChannel?.community_id,
      ) ?? null)
    : null;
  const activeVoiceControllerChannel = React.useMemo(
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
  const handleVoiceSessionError = React.useCallback(
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
  const handleVoiceKickReceived = React.useCallback(() => {
    void app.forceDisconnectVoice("kicked")
      .then(() => {
        app.showVoiceDisconnectToast({ reason: "kicked" });
      })
      .catch((error: unknown) => {
        console.error("Failed to force disconnect voice after kick:", error);
      });
  }, [app]);
  const visibleVoiceChannelParticipants = React.useMemo(
    () =>
      filterBlockedUsersFromParticipantRecord(
        app.voiceChannelParticipants,
        app.blockedUserIds,
        app.isCurrentUserElevatedInCurrentServer,
      ),
    [
      app.blockedUserIds,
      app.isCurrentUserElevatedInCurrentServer,
      app.voiceChannelParticipants,
    ],
  );
  const visibleActiveVoiceParticipantPreview = React.useMemo(
    () =>
      app.activeVoiceChannel
        ? filterBlockedUsersFromParticipantList(
            app.voiceChannelParticipants[app.activeVoiceChannel.id] ?? [],
            app.blockedUserIds,
            app.isCurrentUserElevatedInActiveVoiceServer,
          )
        : [],
    [
      app.activeVoiceChannel,
      app.blockedUserIds,
      app.isCurrentUserElevatedInActiveVoiceServer,
      app.voiceChannelParticipants,
    ],
  );
  const isSelectedDmConversationBlocked = React.useMemo(
    () =>
      Boolean(
        app.selectedDmConversation?.otherUserId &&
          app.blockedUserIds.has(app.selectedDmConversation.otherUserId),
      ),
    [app.blockedUserIds, app.selectedDmConversation?.otherUserId],
  );
  const voiceController = useVoiceSessionController({
    activeChannel: activeVoiceControllerChannel,
    currentUserId: app.user?.id,
    currentUserDisplayName: app.userDisplayName,
    currentUserAvatarUrl: app.profileAvatarUrl,
    blockedUserIds: app.blockedUserIds,
    isElevatedInActiveServer: app.isCurrentUserElevatedInActiveVoiceServer,
    voiceSettings: app.appSettings.voice,
    notificationAudioSettings: app.appSettings.notifications,
    showDiagnostics: app.isPlatformStaff,
    onUpdateVoiceSettings: (next) => {
      void app.setVoiceSettings(next);
    },
    onParticipantsChange: app.setVoiceParticipants,
    onConnectionChange: app.setVoiceConnected,
    onSessionStateChange: app.setVoiceSessionState,
    onControlActionsReady: app.setVoiceControlActions,
    onSessionError: handleVoiceSessionError,
    onVoiceKick: handleVoiceKickReceived,
  });
  const visibleActiveVoiceParticipants = React.useMemo(
    () =>
      filterBlockedUsersFromParticipantList(
        voiceController.state.participants,
        app.blockedUserIds,
        app.isCurrentUserElevatedInActiveVoiceServer,
      ),
    [
      app.blockedUserIds,
      app.isCurrentUserElevatedInActiveVoiceServer,
      voiceController.state.participants,
    ],
  );
  const managedReportServers = React.useMemo(
    () =>
      orderedServers
        .filter((server) => app.managedReportServerIds.includes(server.id))
        .map((server) => ({ id: server.id, name: server.name })),
    [app.managedReportServerIds, orderedServers],
  );
  const voicePopoutWindowOpen =
    canOpenVoicePopout && Boolean(voicePopoutState?.isOpen);

  // CHECKPOINT 1 COMPLETE
  React.useEffect(() => {
    if (!hasSameServerIdOrder(app.servers, orderedServers)) {
      setStoredServers(orderedServers);
    }
    setStoredCurrentServerId(app.currentServerId);
    setStoredCurrentServer(app.currentServer);
  }, [
    app.currentServer,
    app.currentServerId,
    app.servers,
    orderedServers,
    setStoredCurrentServer,
    setStoredCurrentServerId,
    setStoredServers,
  ]);

  React.useEffect(() => {
    if (!canOpenVoicePopout) return;

    return desktopClient.onVoicePopoutState((nextState) => {
      setVoicePopoutState(nextState);
    });
  }, [canOpenVoicePopout]);

  React.useEffect(() => {
    if (!voicePopoutWindowOpen) return;
    setVoicePanelOpen(false);
  }, [setVoicePanelOpen, voicePopoutWindowOpen]);

  React.useEffect(() => {
    if (!canOpenVoicePopout) return;

    void desktopClient
      .syncVoicePopoutState({
        isOpen: voicePopoutWindowOpen,
        serverName: activeVoiceServer?.name ?? app.currentServer?.name ?? null,
        channelName: app.activeVoiceChannel?.name ?? null,
        connected: voiceJoined,
        joined: voiceJoined,
        joining: voiceController.state.joining,
        isMuted: voiceMuted,
        isDeafened: voiceDeafened,
        transmissionMode: app.appSettings.voice.transmissionMode,
        participantCount: visibleActiveVoiceParticipants.length + (voiceJoined ? 1 : 0),
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
    app.currentServer?.name,
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
  ]);

  React.useEffect(() => {
    if (!canOpenVoicePopout) return;

    return desktopClient.onVoicePopoutControlAction((action) => {
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
          setShowVoiceSettingsModal(true);
          return;
        case "open_voice_hardware_test":
          setUserVoiceHardwareTestOpen(true);
          return;
        default:
          return;
      }
    });
  }, [
    canOpenVoicePopout,
    disconnectVoiceSession,
    setShowVoiceSettingsModal,
    setUserVoiceHardwareTestOpen,
    voiceController.actions.setMemberVolume,
    voiceController.actions.setOutputDevice,
    voiceController.actions.switchInputDevice,
    voiceController.actions.joinVoiceChannel,
    voiceController.actions.toggleDeafen,
    voiceController.actions.toggleMute,
    voiceController.actions.updateVoiceSettingsPatch,
  ]);

  const handleOpenVoicePopout = React.useCallback(() => {
    if (!canOpenVoicePopout) return;
    setVoicePanelOpen(false);

    void desktopClient.openVoicePopout().catch((error: unknown) => {
      toast.error(getErrorMessage(error, "Failed to open voice popout."));
    });
  }, [canOpenVoicePopout, setVoicePanelOpen]);

  const handleVoiceHeaderChannelNavigate = () => {
    if (!app.activeVoiceChannel) return;

    if (!activeVoiceServer) {
      toast.error("This voice channel is no longer available.");
      return;
    }

    app.setWorkspaceMode("community");
    app.setCurrentServerId(activeVoiceServer.id);

    const isKnownMissingVoiceChannelInCurrentServer =
      activeVoiceServer.id === app.currentServerId &&
      !app.channels.some(
        (channel) =>
          channel.id === app.activeVoiceChannel?.id && channel.kind === "voice",
      );

    if (isKnownMissingVoiceChannelInCurrentServer) {
      toast.message("Voice channel unavailable. Opened a safe default view.");
      return;
    }

    app.setCurrentChannelId(app.activeVoiceChannel.id);
  };

  if (app.authStatus === "initializing") {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        Loading...
      </div>
    );
  }

  if (app.authStatus === "error") {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        <p>
          {app.authError ?? "Authentication failed. Please restart the app."}
        </p>
      </div>
    );
  }

  if (!app.user) {
    return <LoginScreen />;
  }

  const { user } = app;
  const canKickVoiceParticipants =
    app.serverPermissions.isOwner ||
    app.serverPermissions.canManageServer ||
    app.serverPermissions.canManageMembers ||
    app.serverPermissions.canManageBans;
  const canManageChannelStructure =
    app.serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    app.serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  const handleKickVoiceParticipant = async (
    targetUserId: string,
    displayName: string,
  ) => {
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
          toast.dismiss(`voice-kick:${app.activeVoiceChannelId}:${targetUserId}`);
        },
      },
    });
  };

  return (
    <>
      <PasswordRecoveryDialog
        open={app.passwordRecoveryRequired}
        onCompletePasswordRecovery={app.completePasswordRecovery}
        onSignOut={app.signOut}
      />

      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          onReorder={setServerOrder}
          currentServerIsOwner={app.serverPermissions.isOwner}
          canManageCurrentServer={app.canManageCurrentServer}
          canOpenCurrentServerSettings={app.canOpenServerSettings}
          onServerClick={(serverId) => {
            app.setWorkspaceMode("community");
            app.setCurrentServerId(serverId);
          }}
          onCreateServer={() => app.setShowCreateModal(true)}
          onJoinServer={() => app.setShowJoinServerModal(true)}
          onOpenNotifications={() => app.setNotificationsPanelOpen(true)}
          notificationUnseenCount={app.notificationCounts.unseenCount}
          notificationHasUnseenPulse={app.notificationCounts.unseenCount > 0}
          onOpenDirectMessages={
            app.dmWorkspaceEnabled ? app.openDirectMessagesWorkspace : undefined
          }
          directMessagesActive={app.dmWorkspaceIsActive}
          directMessageUnreadCount={totalDmUnreadCount}
          onOpenFriends={
            app.friendsSocialPanelEnabled
              ? () => {
                  app.setFriendsPanelRequestedTab(null);
                  app.setFriendsPanelHighlightedRequestId(null);
                  app.setFriendsPanelOpen(true);
                }
              : undefined
          }
          friendRequestIncomingCount={
            app.socialCounts.incomingPendingRequestCount
          }
          friendRequestHasPendingPulse={
            app.socialCounts.incomingPendingRequestCount > 0
          }
          onOpenServerModmail={
            app.serverModmailEnabled
              ? () => app.setServerModmailOpen(true)
              : undefined
          } // CHECKPOINT 6 COMPLETE
          userDisplayName={app.userDisplayName}
          userAvatarUrl={app.profileAvatarUrl}
          onOpenAccountSettings={() => app.setShowAccountModal(true)}
          onViewServerMembers={(serverId) => {
            void app.openServerMembersModal(serverId);
          }}
          onLeaveServer={app.handleLeaveServer}
          onDeleteServer={app.handleDeleteServer}
          onRenameServer={app.handleRenameServer}
          onOpenServerSettingsForServer={(serverId) => {
            void app.openServerSettingsModal(serverId);
          }}
        />

        {app.showDmWorkspace ? (
          <>
            <DirectMessagesSidebar
              currentUserDisplayName={app.userDisplayName}
              refreshing={app.dmConversationsRefreshing}
              error={app.dmConversationsError}
              onSelectConversation={(conversationId) => {
                void app
                  .openDirectMessageConversation(conversationId)
                  .catch((error: unknown) => {
                    toast.error(
                      getErrorMessage(error, "Failed to open direct message."),
                    );
                  });
              }}
              onRefresh={() => {
                void app.refreshDmConversations({ suppressLoadingState: true });
              }}
            />
            <DirectMessageArea
              currentUserId={user.id}
              currentUserDisplayName={app.userDisplayName}
              messages={app.dmMessages}
              loading={app.dmMessagesLoading}
              sending={app.dmMessageSendPending}
              refreshing={app.dmMessagesRefreshing}
              error={app.dmMessagesError}
              messagingUnavailable={isSelectedDmConversationBlocked}
              onRefresh={() => {
                if (!app.selectedDmConversationId) return;
                void app.refreshDmMessages(app.selectedDmConversationId, {
                  suppressLoadingState: true,
                  markRead: true,
                });
              }}
              onSendMessage={app.sendDirectMessage}
              onToggleMute={app.toggleSelectedDmConversationMuted}
              onBlockUser={app.blockDirectMessageUser}
              onReportMessage={app.reportDirectMessage}
            />
          </>
        ) : app.isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">Loading servers...</p>
          </div>
        ) : app.currentServer ? (
          <>
            <Sidebar
              serverName={app.currentServer.name}
              userName={app.userDisplayName}
              composerHeight={app.composerHeight}
              channels={app.channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                kind: channel.kind,
              }))}
              channelGroups={app.sidebarChannelGroups}
              ungroupedChannelIds={app.channelGroupState.ungroupedChannelIds}
              currentChannelId={app.currentChannelId}
              onChannelClick={app.setCurrentChannelId}
              onVoiceChannelClick={app.requestVoiceChannelJoin}
              activeVoiceChannelId={app.activeVoiceChannelId}
              voiceChannelParticipants={visibleVoiceChannelParticipants}
              voiceStatusPanel={
                app.activeVoiceChannel && !voicePopoutWindowOpen ? (
                  <VoiceDrawer
                    surface="sidebar"
                    serverName={
                      activeVoiceServer?.name ??
                      app.currentServer?.name ??
                      "Unknown server"
                    }
                    channelName={app.activeVoiceChannel.name}
                    participantCount={
                      visibleActiveVoiceParticipants.length +
                      (voiceController.state.joined ? 1 : 0)
                    }
                    participantPreview={visibleActiveVoiceParticipantPreview}
                    memberControls={visibleActiveVoiceParticipants.map(
                      (participant) => ({
                        userId: participant.userId,
                        displayName: participant.displayName,
                        isMuted: participant.muted,
                        isDeafened: participant.deafened,
                        volume:
                          voiceController.state.remoteVolumes[
                            participant.userId
                          ] ?? 100,
                      }),
                    )}
                    voiceConnected={voiceController.state.joined}
                    voicePanelOpen={app.voicePanelOpen}
                    joining={voiceController.state.joining}
                    voiceSessionState={{
                      joined: voiceController.state.joined,
                      isMuted: voiceController.state.isMuted,
                      isDeafened: voiceController.state.isDeafened,
                    }}
                    transmissionMode={app.appSettings.voice.transmissionMode}
                    inputDevices={voiceController.state.inputDevices}
                    outputDevices={voiceController.state.outputDevices}
                    selectedInputDeviceId={
                      voiceController.state.selectedInputDeviceId
                    }
                    selectedOutputDeviceId={
                      voiceController.state.selectedOutputDeviceId
                    }
                    supportsOutputSelection={
                      voiceController.state.supportsOutputSelection
                    }
                    onOpenChange={app.setVoicePanelOpen}
                    onJoin={() => {
                      void voiceController.actions.joinVoiceChannel();
                    }}
                    onToggleMute={voiceController.actions.toggleMute}
                    onToggleDeafen={voiceController.actions.toggleDeafen}
                    onDisconnect={() => {
                      void app.disconnectVoiceSession();
                    }}
                    onSelectTransmissionMode={(mode) => {
                      voiceController.actions.updateVoiceSettingsPatch({
                        transmissionMode: mode,
                      });
                    }}
                    onSelectInputDevice={(deviceId) => {
                      void voiceController.actions.switchInputDevice(deviceId);
                    }}
                    onSelectOutputDevice={
                      voiceController.actions.setOutputDevice
                    }
                    onSetMemberVolume={voiceController.actions.setMemberVolume}
                    onResetMemberVolume={
                      voiceController.actions.resetMemberVolume
                    }
                    onResetAllMemberVolumes={
                      voiceController.actions.resetAllMemberVolumes
                    }
                    onOpenAdvancedOptions={() =>
                      app.setShowVoiceSettingsModal(true)
                    }
                    onOpenVoiceHardwareTest={() =>
                      app.setUserVoiceHardwareTestOpen(true)
                    }
                    canOpenVoicePopout={canOpenVoicePopout}
                    onOpenVoicePopout={handleOpenVoicePopout}
                  />
                ) : null
              }
              footerStatusActions={null}
              onCreateChannel={
                app.serverPermissions.canCreateChannels
                  ? () => app.setShowCreateChannelModal(true)
                  : undefined
              }
              canManageChannels={canOpenChannelSettings}
              canManageChannelStructure={canManageChannelStructure}
              onRenameChannel={
                canManageChannelStructure ? app.handleRenameChannel : undefined
              }
              onDeleteChannel={
                canManageChannelStructure ? app.handleDeleteChannel : undefined
              }
              onOpenChannelSettings={
                canOpenChannelSettings
                  ? (channelId) => {
                      void app.openChannelSettingsModal(channelId);
                    }
                  : undefined
              }
              onAddChannelToGroup={
                canManageChannelStructure
                  ? (channelId, groupId) => {
                      void app
                        .assignChannelToGroup(channelId, groupId)
                        .catch((error: unknown) => {
                          toast.error(
                            getErrorMessage(
                              error,
                              "Failed to assign channel to group.",
                            ),
                            {
                              id: "assign-channel-group-error",
                            },
                          );
                        });
                    }
                  : undefined
              }
              onRemoveChannelFromGroup={
                canManageChannelStructure
                  ? (channelId) => {
                      void app
                        .removeChannelFromGroup(channelId)
                        .catch((error: unknown) => {
                          toast.error(
                            getErrorMessage(
                              error,
                              "Failed to remove channel from group.",
                            ),
                            { id: "remove-channel-group-error" },
                          );
                        });
                    }
                  : undefined
              }
              onCreateChannelGroup={
                canManageChannelStructure
                  ? app.handleCreateChannelGroup
                  : undefined
              }
              onToggleChannelGroup={(groupId, isCollapsed) => {
                void app
                  .setChannelGroupCollapsed(groupId, isCollapsed)
                  .catch((error: unknown) => {
                    console.error(
                      "Failed to persist channel group collapse state:",
                      error,
                    );
                  });
              }}
              onRenameChannelGroup={
                canManageChannelStructure
                  ? app.handleRenameChannelGroup
                  : undefined
              }
              onDeleteChannelGroup={
                canManageChannelStructure
                  ? app.handleDeleteChannelGroup
                  : undefined
              }
              onOpenServerSettings={
                app.canOpenServerSettings
                  ? () => void app.openServerSettingsModal()
                  : undefined
              }
            />

            {app.channelsLoading && !app.currentRenderableChannel ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">Loading channels...</p>
              </div>
            ) : app.currentRenderableChannel ? (
              <ChatArea
                channelId={app.currentRenderableChannel.id}
                channelName={app.currentRenderableChannel.name}
                channelKind={app.currentRenderableChannel.kind}
                currentUserId={user.id}
                  blockedUserIds={app.blockedUserIds}
                  isElevatedViewer={app.isCurrentUserElevatedInCurrentServer}
                  canManageMessages={app.serverPermissions.canManageMessages}
                  canCreateReports={app.serverPermissions.canCreateReports}
                  canManageBans={app.serverPermissions.canManageBans}
                  canManageMembers={app.serverPermissions.canManageMembers}
                  canRefreshLinkPreviews={
                    app.serverPermissions.canRefreshLinkPreviews
                  }
                showVoiceDiagnostics={app.isPlatformStaff}
                onOpenChannelSettings={
                  canOpenChannelSettings
                    ? () =>
                        void app.openChannelSettingsModal(
                          app.currentRenderableChannel!.id,
                        )
                    : undefined
                }
                onOpenVoiceControls={() => app.setShowVoiceSettingsModal(true)}
                onSendMessage={app.sendMessage}
                onEditMessage={app.editMessage}
                onDeleteMessage={app.deleteMessage}
                onToggleMessageReaction={app.toggleMessageReaction}
                onReportMessage={app.reportMessage}
                onRequestMessageLinkPreviewRefresh={
                  app.requestMessageLinkPreviewRefresh
                }
                onRequestOlderMessages={app.requestOlderMessages}
                onSaveAttachment={app.saveAttachment}
                onReportUserProfile={({ targetUserId, reason }) =>
                  app.reportUserProfile({
                    targetUserId,
                    reason,
                    communityId: app.currentServer!.id,
                  })
                }
                onBanUserFromServer={app.banUserFromServer}
                onKickUserFromCurrentServer={async ({ targetUserId, username }) => {
                  await app.kickUserFromServer({
                    targetUserId,
                    username,
                    communityId: app.currentServer!.id,
                  });
                }}
                onResolveBanEligibleServers={app.resolveBanEligibleServers}
                onDirectMessageUser={app.directMessageUser}
                onComposerHeightChange={app.setComposerHeight}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">
                  {app.channelsError ??
                    "No channels yet. Create one to get started!"}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">
              {app.serversError ?? "No servers yet. Create one to get started!"}
            </p>
          </div>
        )}
      </div>

      <NotificationCenterModal
        open={app.notificationsPanelOpen}
        onOpenChange={app.setNotificationsPanelOpen}
        counts={app.notificationCounts}
        error={app.notificationsError}
        refreshing={app.notificationsRefreshing}
        onRefresh={() => void app.refreshNotificationsManually()}
        onMarkAllSeen={() => void app.markAllNotificationsSeen()}
        onDismissAll={() => void app.dismissAllNotifications()}
        onMarkNotificationRead={(recipientId) =>
          void app.markNotificationRead(recipientId)
        }
        onDismissNotification={(recipientId) =>
          void app.dismissNotification(recipientId)
        }
        onOpenNotificationItem={(notification) =>
          void app.openNotificationItem(notification)
        }
        onAcceptFriendRequestNotification={({
          recipientId,
          friendRequestId,
        }) => {
          void app.acceptFriendRequestFromNotification({
            recipientId,
            friendRequestId,
          });
        }}
        onDeclineFriendRequestNotification={({
          recipientId,
          friendRequestId,
        }) => {
          void app.declineFriendRequestFromNotification({
            recipientId,
            friendRequestId,
          });
        }}
        onDismissFriendRequestNotification={({
          recipientId,
          friendRequestId,
        }) => {
          void app.dismissFriendRequestNotification({
            recipientId,
            friendRequestId,
          });
        }}
        preferences={app.notificationPreferences}
        preferencesLoading={app.notificationPreferencesLoading}
        preferencesSaving={app.notificationPreferencesSaving}
        preferencesError={app.notificationPreferencesError}
        onUpdatePreferences={(next) =>
          void app.saveNotificationPreferences(next)
        }
        localAudioSettings={app.appSettings.notifications}
        localAudioSaving={app.notificationAudioSettingsSaving}
        localAudioError={app.notificationAudioSettingsError}
        onUpdateLocalAudioSettings={(next) =>
          void app.setNotificationAudioSettings(next)
        }
      />

      {app.friendsSocialPanelEnabled && user && (
        <FriendsModal
          open={app.friendsPanelOpen}
          onOpenChange={(open) => {
            app.setFriendsPanelOpen(open);
            if (!open) app.setFriendsPanelHighlightedRequestId(null);
          }}
          currentUserId={user.id}
          currentUserDisplayName={app.userDisplayName}
          onStartDirectMessage={app.directMessageUser}
          requestedTab={app.friendsPanelRequestedTab}
          highlightedRequestId={app.friendsPanelHighlightedRequestId}
        />
      )}

      {app.voiceHardwareDebugPanelEnabled && (
        <VoiceHardwareDebugPanel
          open={app.voiceHardwareDebugPanelOpen}
          onOpenChange={app.setVoiceHardwareDebugPanelOpen}
          hotkeyLabel={VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL}
        />
      )}

      {app.serverModmailEnabled && user && (
        <ServerModmailPanel
          open={app.serverModmailOpen}
          onOpenChange={app.setServerModmailOpen}
          currentUserDisplayName={app.userDisplayName}
          managedServers={managedReportServers}
          serverPermissionsById={app.serverReportPermissionsById}
          reportStatusRefreshVersion={app.reportStatusRefreshVersion}
          onBanUserFromServer={app.banUserFromServer}
          onKickUserFromServer={app.kickUserFromServer}
        />
      )}

      <AlertDialog
        open={Boolean(app.voiceJoinPrompt)}
        onOpenChange={(open) => !open && app.cancelVoiceChannelJoinPrompt()}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {app.voiceJoinPrompt?.mode === "switch"
                ? "Switch voice channel?"
                : "Join voice channel?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {app.voiceJoinPrompt?.mode === "switch"
                ? "You are already connected to voice. Switching will move your session to the new channel."
                : "Join this voice channel now? You can keep browsing text channels while connected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={app.confirmVoiceChannelJoin}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {app.voiceJoinPrompt?.mode === "switch" ? "Switch" : "Join"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(app.pendingUiConfirmation)}
        onOpenChange={(open) => {
          if (!open) app.setPendingUiConfirmation(null);
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {app.pendingUiConfirmationTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {app.pendingUiConfirmationDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                app.confirmPendingUiAction();
              }}
              className={
                app.pendingUiConfirmationIsDestructive
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-[#3f79d8] hover:bg-[#325fae] text-white"
              }
            >
              {app.pendingUiConfirmationConfirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {app.showCreateModal && (
        <CreateServerModal
          onClose={() => app.setShowCreateModal(false)}
          onCreate={app.createServer}
        />
      )}

      {app.showCreateChannelModal &&
        app.currentServerId &&
        app.serverPermissions.canCreateChannels && (
          <CreateChannelModal
            onClose={() => app.setShowCreateChannelModal(false)}
            onCreate={app.createChannel}
          />
        )}

      {app.showJoinServerModal && (
        <JoinServerModal
          onClose={() => app.setShowJoinServerModal(false)}
          onJoin={app.joinServerByInvite}
        />
      )}

      {app.showServerSettingsModal &&
        app.currentServerId &&
        app.canOpenServerSettings && (
          <ServerSettingsModal
            initialValues={app.serverSettingsInitialValues}
            loadingInitialValues={app.serverSettingsLoading}
            initialLoadError={app.serverSettingsLoadError}
            canManageServer={app.serverPermissions.canManageServer}
            canManageRoles={app.serverPermissions.canManageRoles}
            canManageMembers={app.serverPermissions.canManageMembers}
            canManageBans={app.serverPermissions.canManageBans}
            isOwner={app.serverPermissions.isOwner}
            roles={app.serverRoles}
            members={app.serverMembers}
            permissionsCatalog={app.serverPermissionCatalog}
            roleManagementLoading={app.serverRoleManagementLoading}
            roleManagementError={app.serverRoleManagementError}
            canManageInvites={app.serverPermissions.canManageInvites}
            invites={app.serverInvites}
            invitesLoading={app.serverInvitesLoading}
            invitesError={app.serverInvitesError}
            bans={app.communityBans}
            bansLoading={app.communityBansLoading}
            bansError={app.communityBansError}
            inviteBaseUrl={app.getPlatformInviteBaseUrl()}
            onClose={() => app.setShowServerSettingsModal(false)}
            onSave={app.saveServerSettings}
            onCreateRole={app.createServerRole}
            onUpdateRole={app.updateServerRole}
            onDeleteRole={app.deleteServerRole}
            onSaveRolePermissions={app.saveServerRolePermissions}
            onSaveMemberRoles={app.saveServerMemberRoles}
            onCreateInvite={app.createServerInvite}
            onRevokeInvite={app.revokeServerInvite}
            onUnbanUser={app.unbanUserFromCurrentServer}
          />
        )}

      {app.showChannelSettingsModal &&
        app.channelSettingsTarget &&
        canOpenChannelSettings && (
          <ChannelSettingsModal
            initialName={app.channelSettingsTarget.name}
            initialTopic={app.channelSettingsTarget.topic}
            canDelete={app.channels.length > 1}
            canManageChannelStructure={canManageChannelStructure}
            canManageChannelPermissions={canManageChannelPermissions}
            rolePermissions={app.channelRolePermissions}
            memberPermissions={app.channelMemberPermissions}
            availableMembers={app.channelPermissionMemberOptions}
            permissionsLoading={app.channelPermissionsLoading}
            permissionsLoadError={app.channelPermissionsLoadError}
            onClose={() => {
              app.setShowChannelSettingsModal(false);
              app.setChannelSettingsTargetId(null);
            }}
            onSave={app.saveChannelSettings}
            onDelete={app.deleteCurrentChannel}
            onSaveRolePermissions={app.saveRoleChannelPermissions}
            onSaveMemberPermissions={app.saveMemberChannelPermissions}
          />
        )}

      <ServerMembersModal
        open={app.showMembersModal}
        currentUserId={user?.id ?? null}
        serverName={app.membersModalServerName}
        loading={app.membersModalLoading}
        error={app.membersModalError}
        members={app.membersModalMembers}
        blockedUserIds={app.blockedUserIds}
        isElevatedViewer={app.isCurrentUserElevatedInMembersModalServer}
        canReportProfiles={app.membersModalCanCreateReports}
        canBanProfiles={app.membersModalCanManageBans}
        canKickProfiles={app.membersModalCanManageMembers}
        onResolveBanServers={app.resolveBanEligibleServers}
        onDirectMessage={app.directMessageUser}
        onReportUser={async (targetUserId, reason) => {
          if (!app.membersModalCommunityId) return;
          await app.reportUserProfile({
            targetUserId,
            reason,
            communityId: app.membersModalCommunityId,
          });
        }}
        onBanUser={async (targetUserId, communityId, reason) => {
          await app.banUserFromServer({ targetUserId, communityId, reason });
        }}
        onKickUser={async (targetUserId, username) => {
          if (!app.membersModalCommunityId) return;
          await app.kickUserFromServer({
            targetUserId,
            username,
            communityId: app.membersModalCommunityId,
          });
        }}
        onClose={app.closeMembersModal}
      />

      <QuickRenameDialog
        open={Boolean(app.renameServerDraft)}
        title="Rename Community"
        initialValue={app.renameServerDraft?.currentName ?? ""}
        confirmLabel="Rename"
        onClose={() => app.setRenameServerDraft(null)}
        onConfirm={async (value) => {
          if (!app.renameServerDraft) return;
          await app.renameServer(app.renameServerDraft.serverId, value);
          app.setRenameServerDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(app.renameChannelDraft)}
        title="Rename Channel"
        initialValue={app.renameChannelDraft?.currentName ?? ""}
        confirmLabel="Rename"
        onClose={() => app.setRenameChannelDraft(null)}
        onConfirm={async (value) => {
          if (!app.renameChannelDraft) return;
          await app.renameChannel(app.renameChannelDraft.channelId, value);
          app.setRenameChannelDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(app.renameGroupDraft)}
        title="Rename Channel Group"
        initialValue={app.renameGroupDraft?.currentName ?? ""}
        confirmLabel="Rename"
        onClose={() => app.setRenameGroupDraft(null)}
        onConfirm={async (value) => {
          if (!app.renameGroupDraft) return;
          await app.renameChannelGroup(app.renameGroupDraft.groupId, value);
          app.setRenameGroupDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(app.createGroupDraft)}
        title="Create Channel Group"
        initialValue=""
        confirmLabel="Create"
        onClose={() => app.setCreateGroupDraft(null)}
        onConfirm={async (value) => {
          await app.createChannelGroup(
            value,
            app.createGroupDraft?.channelId ?? null,
          );
          app.setCreateGroupDraft(null);
        }}
      />

      {app.showAccountModal && (
        <AccountSettingsModal
          userEmail={user.email ?? "No email"}
          initialUsername={app.baseUserDisplayName}
          initialAvatarUrl={app.profileAvatarUrl}
          autoUpdateEnabled={app.appSettings.autoUpdateEnabled}
          updaterStatus={app.updaterStatus}
          updaterStatusLoading={
            app.updaterStatusLoading || app.appSettingsLoading
          }
          checkingForUpdates={app.checkingForUpdates}
          onClose={() => app.setShowAccountModal(false)}
          onSave={app.saveAccountSettings}
          onOpenVoiceSettings={() => app.setShowVoiceSettingsModal(true)}
          onAutoUpdateChange={app.setAutoUpdateEnabled}
          onCheckForUpdates={app.checkForUpdatesNow}
          onSignOut={app.signOut}
          onDeleteAccount={app.deleteAccount}
        />
      )}

      <VoiceSettingsModal
        open={app.showVoiceSettingsModal}
        onOpenChange={app.setShowVoiceSettingsModal}
        settings={app.appSettings.voice}
        saving={app.voiceSettingsSaving}
        error={app.voiceSettingsError}
        activeChannelName={app.activeVoiceChannel?.name ?? null}
        currentUserDisplayName={app.userDisplayName}
        currentUserAvatarUrl={app.profileAvatarUrl}
        voiceSessionState={{
          ...voiceController.state,
          participants: visibleActiveVoiceParticipants,
        }}
        voiceSessionActions={voiceController.actions}
        showDiagnostics={app.isPlatformStaff}
        canOpenVoicePopout={canOpenVoicePopout}
        canKickParticipants={canKickVoiceParticipants}
        onDisconnect={() => {
          void app.disconnectVoiceSession();
        }}
        onOpenVoicePopout={handleOpenVoicePopout}
        onOpenVoiceHardwareTest={() => app.setUserVoiceHardwareTestOpen(true)}
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

      <VoiceHardwareDebugPanel
        open={app.userVoiceHardwareTestOpen}
        onOpenChange={app.setUserVoiceHardwareTestOpen}
        hotkeyLabel={null}
        title="Voice Hardware Test"
        description="Test microphone capture and speaker playback locally before joining a voice channel."
        showDebugWorkflow={false}
      />

      {Object.keys(voiceController.state.remoteStreams).map((userId) => (
        <audio
          key={userId}
          autoPlay
          playsInline
          className="hidden"
          ref={(element) => {
            voiceController.actions.bindAudioElement(userId, element);
          }}
        />
      ))}
    </>
  );
}
