import React from "react";
import { LoginScreen } from "@shared/features/auth/components/LoginScreen";
import { ServerList } from "@shared/app/components/ServerList";
import { Sidebar } from "@shared/app/components/Sidebar";
import { ChatArea } from "@shared/features/messaging/components/ChatArea";
import { VoiceDrawer } from "@shared/features/voice/components/VoiceDrawer";
import { toast } from "sonner";
import { useServerOrder } from "@shared/features/community/hooks/useServerOrder";
import { ChatAppModals } from "@shared/app/components/ChatAppModals";
import { ChatAppDmWorkspace } from "@shared/app/chat-app/ChatAppDmWorkspace";
import { useChatAppVoiceIntegration } from "@shared/app/chat-app/useChatAppVoiceIntegration";
import { useDmStore } from "@shared/stores/dmStore";
import { useServersStore } from "@shared/stores/serversStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import { useSocialStore } from "@shared/stores";
import { useUiStore } from "@shared/stores/uiStore";
import { useChatAppOrchestration } from "@shared/app/hooks/useChatAppOrchestration";
import { getErrorMessage } from "@platform/lib/errors";

function hasSameServerIdOrder(
  left: ReadonlyArray<{ id: string }>,
  right: ReadonlyArray<{ id: string }>,
) {
  if (left.length !== right.length) return false;
  return left.every((server, index) => server.id === right[index]?.id);
}

export function ChatApp() {
  const app = useChatAppOrchestration();
  const voice = useChatAppVoiceIntegration(app);
  const totalDmUnreadCount = useDmStore((state) =>
    Object.values(state.unreadCounts).reduce(
      (total, count) => total + count,
      0,
    ),
  );
  const servers = useServersStore((state) => state.servers);
  const currentServer = useNavigationStore((state) => state.currentServer);
  const setStoredServers = useServersStore((state) => state.setServers);
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setCurrentChannelId = useNavigationStore(
    (state) => state.setCurrentChannelId,
  );
  const setWorkspaceMode = useNavigationStore(
    (state) => state.setWorkspaceMode,
  );
  const setCurrentServerId = useNavigationStore(
    (state) => state.setCurrentServerId,
  );
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );
  const blockedUserIds = useSocialStore((state) => state.blockedUserIds);
  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    servers,
  );
  const isSelectedDmConversationBlocked = React.useMemo(
    () =>
      Boolean(
        app.selectedDmConversation?.otherUserId &&
          blockedUserIds.has(app.selectedDmConversation.otherUserId),
      ),
    [blockedUserIds, app.selectedDmConversation?.otherUserId],
  );
  const managedReportServers = React.useMemo(
    () =>
      orderedServers
        .filter((server) => app.managedReportServerIds.includes(server.id))
        .map((server) => ({ id: server.id, name: server.name })),
    [app.managedReportServerIds, orderedServers],
  );

  React.useEffect(() => {
    if (!hasSameServerIdOrder(servers, orderedServers)) {
      setStoredServers(orderedServers);
    }
  }, [servers, orderedServers, setStoredServers]);

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
  const canManageChannelStructure = serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          onReorder={setServerOrder}
          currentServerIsOwner={serverPermissions.isOwner}
          canManageCurrentServer={app.canManageCurrentServer}
          canOpenCurrentServerSettings={app.canOpenServerSettings}
          onServerClick={(serverId) => {
            setWorkspaceMode("community");
            setCurrentServerId(serverId);
          }}
          onCreateServer={() =>
            useUiStore.getState().setShowCreateModal(true)
          }
          onJoinServer={() =>
            useUiStore.getState().setShowJoinServerModal(true)
          }
          onOpenNotifications={() =>
            useNotificationsStore.getState().setIsPanelOpen(true)
          }
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
              ? () => useUiStore.getState().setServerModmailOpen(true)
              : undefined
          }
          userDisplayName={app.userDisplayName}
          userAvatarUrl={app.profileAvatarUrl}
          onOpenAccountSettings={() =>
            useUiStore.getState().setShowAccountModal(true)
          }
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
          <ChatAppDmWorkspace
            app={app}
            user={user}
            isSelectedDmConversationBlocked={isSelectedDmConversationBlocked}
          />
        ) : app.isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">Loading servers...</p>
          </div>
        ) : currentServer ? (
          <>
            <Sidebar
              serverName={currentServer.name}
              userName={app.userDisplayName}
              channels={app.channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                kind: channel.kind,
              }))}
              userStatus={app.userStatus}
              rainbowMode={app.rainbowMode}
              onStatusChange={app.setUserStatus}
              channelGroups={app.sidebarChannelGroups}
              ungroupedChannelIds={app.channelGroupState.ungroupedChannelIds}
              onChannelClick={setCurrentChannelId}
              onVoiceChannelClick={app.requestVoiceChannelJoin}
              activeVoiceChannelId={app.activeVoiceChannelId}
              voiceChannelParticipants={voice.visibleVoiceChannelParticipants}
              voiceStatusPanel={
                app.activeVoiceChannel && !voice.voicePopoutWindowOpen ? (
                  <VoiceDrawer
                    surface="sidebar"
                    serverName={
                      voice.activeVoiceServer?.name ??
                      currentServer?.name ??
                      "Unknown server"
                    }
                    channelName={app.activeVoiceChannel.name}
                    participantCount={
                      voice.visibleActiveVoiceParticipants.length +
                      (voice.voiceController.state.joined ? 1 : 0)
                    }
                    participantPreview={voice.visibleActiveVoiceParticipantPreview}
                    memberControls={voice.visibleActiveVoiceParticipants.map(
                      (participant) => ({
                        userId: participant.userId,
                        displayName: participant.displayName,
                        isMuted: participant.muted,
                        isDeafened: participant.deafened,
                        volume:
                          voice.voiceController.state.remoteVolumes[
                            participant.userId
                          ] ?? 100,
                      }),
                    )}
                    voiceConnected={voice.voiceController.state.joined}
                    voicePanelOpen={app.voicePanelOpen}
                    joining={voice.voiceController.state.joining}
                    voiceSessionState={{
                      joined: voice.voiceController.state.joined,
                      isMuted: voice.voiceController.state.isMuted,
                      isDeafened: voice.voiceController.state.isDeafened,
                    }}
                    transmissionMode={app.appSettings.voice.transmissionMode}
                    inputDevices={voice.voiceController.state.inputDevices}
                    outputDevices={voice.voiceController.state.outputDevices}
                    selectedInputDeviceId={
                      voice.voiceController.state.selectedInputDeviceId
                    }
                    selectedOutputDeviceId={
                      voice.voiceController.state.selectedOutputDeviceId
                    }
                    supportsOutputSelection={
                      voice.voiceController.state.supportsOutputSelection
                    }
                    onOpenChange={app.setVoicePanelOpen}
                    onJoin={() => {
                      void voice.voiceController.actions.joinVoiceChannel();
                    }}
                    onToggleMute={voice.voiceController.actions.toggleMute}
                    onToggleDeafen={voice.voiceController.actions.toggleDeafen}
                    onDisconnect={() => {
                      void app.disconnectVoiceSession();
                    }}
                    onSelectTransmissionMode={(mode) => {
                      voice.voiceController.actions.updateVoiceSettingsPatch({
                        transmissionMode: mode,
                      });
                    }}
                    onSelectInputDevice={(deviceId) => {
                      void voice.voiceController.actions.switchInputDevice(
                        deviceId,
                      );
                    }}
                    onSelectOutputDevice={
                      voice.voiceController.actions.setOutputDevice
                    }
                    onSetMemberVolume={voice.voiceController.actions.setMemberVolume}
                    onResetMemberVolume={
                      voice.voiceController.actions.resetMemberVolume
                    }
                    onResetAllMemberVolumes={
                      voice.voiceController.actions.resetAllMemberVolumes
                    }
                    onOpenAdvancedOptions={() =>
                      useUiStore.getState().setShowVoiceSettingsModal(true)
                    }
                    onOpenVoiceHardwareTest={() =>
                      useUiStore.getState().setUserVoiceHardwareTestOpen(true)
                    }
                    canOpenVoicePopout={voice.canOpenVoicePopout}
                    onOpenVoicePopout={voice.handleOpenVoicePopout}
                  />
                ) : null
              }
              footerStatusActions={null}
              onCreateChannel={
                serverPermissions.canCreateChannels
                  ? () =>
                      useUiStore.getState().setShowCreateChannelModal(true)
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
                isElevatedViewer={app.isCurrentUserElevatedInCurrentServer}
                canManageMessages={serverPermissions.canManageMessages}
                canCreateReports={serverPermissions.canCreateReports}
                canManageBans={serverPermissions.canManageBans}
                canManageMembers={serverPermissions.canManageMembers}
                canViewBanHidden={serverPermissions.canViewBanHidden}
                canRefreshLinkPreviews={
                  serverPermissions.canRefreshLinkPreviews
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
                onOpenVoiceControls={() =>
                  useUiStore.getState().setShowVoiceSettingsModal(true)
                }
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
                    communityId: currentServer!.id,
                  })
                }
                onBanUserFromServer={app.banUserFromServer}
                onKickUserFromCurrentServer={async ({
                  targetUserId,
                  username,
                }) => {
                  await app.kickUserFromServer({
                    targetUserId,
                    username,
                    communityId: currentServer!.id,
                  });
                }}
                onResolveBanEligibleServers={app.resolveBanEligibleServers}
                onDirectMessageUser={app.directMessageUser}
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
      <ChatAppModals
        app={app}
        user={user}
        managedReportServers={managedReportServers}
        voiceSession={voice.voiceController}
        visibleActiveVoiceParticipants={voice.visibleActiveVoiceParticipants}
        canOpenVoicePopout={voice.canOpenVoicePopout}
        canKickVoiceParticipants={voice.canKickVoiceParticipants}
        handleOpenVoicePopout={voice.handleOpenVoicePopout}
        handleKickVoiceParticipant={voice.handleKickVoiceParticipant}
      />
      {Object.keys(voice.voiceController.state.remoteStreams).map((userId) => (
        <audio
          key={userId}
          autoPlay
          playsInline
          className="hidden"
          ref={(element) => {
            voice.voiceController.actions.bindAudioElement(userId, element);
          }}
        />
      ))}
    </>
  );
}
