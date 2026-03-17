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
import { DmReportReviewPanel } from "@shared/components/DmReportReviewPanel";
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
import {
  WebPushCutoverReadiness,
  WebPushBackendTraceParitySummary,
  WebPushBackendTraceParityDriftRow,
  buildBackendTraceParityDrift,
  buildBackendTraceParitySummary,
  buildBackendWakeSourceCounts,
  buildWebPushCutoverReadiness,
  buildWebPushQueueHealthAlerts,
} from "@shared/lib/notifications/webPushDiagnostics";
import type { VoicePopoutState } from "@platform/desktop/types";
import { toast } from "sonner";
import { useServerOrder } from "@client/features/community/hooks/useServerOrder";

export function ChatApp() {
  const app = useChatAppOrchestration();
  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    app.servers,
  );

  const activeVoiceServer = app.activeVoiceChannel
    ? (app.servers.find(
        (server) => server.id === app.activeVoiceChannel?.community_id,
      ) ?? null)
    : null;

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
  const canManageChannelStructure =
    app.serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    app.serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  return (
    <>
      <PasswordRecoveryDialog
        open={app.passwordRecoveryRequired}
        onCompletePasswordRecovery={app.completePasswordRecovery}
        onSignOut={app.signOut}
      />

      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          servers={orderedServers}
          onReorder={setServerOrder}
          currentServerId={app.currentServerId}
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
          onOpenDmReportReview={
            app.dmReportReviewPanelEnabled
              ? () => app.setDmReportReviewPanelOpen(true)
              : undefined
          }
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
              conversations={app.dmConversations}
              selectedConversationId={app.selectedDmConversationId}
              loading={app.dmConversationsLoading}
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
              conversation={app.selectedDmConversation}
              messages={app.dmMessages}
              loading={app.dmMessagesLoading}
              sending={app.dmMessageSendPending}
              refreshing={app.dmMessagesRefreshing}
              error={app.dmMessagesError}
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
              voiceChannelParticipants={app.voiceChannelParticipants}
              voiceStatusPanel={
                app.activeVoiceChannel ? (
                  <VoiceDrawer
                    notificationAudioSettings={app.appSettings.notifications}
                    communityId={app.activeVoiceChannel.community_id}
                    serverName={app.currentServer.name}
                    channelId={app.activeVoiceChannel.id}
                    channelName={app.activeVoiceChannel.name}
                    currentUserId={user.id}
                    currentUserDisplayName={app.userDisplayName}
                    participantCount={app.activeVoiceParticipantCount}
                    participantPreview={
                      app.voiceChannelParticipants[app.activeVoiceChannel.id] ??
                      []
                    }
                    voiceConnected={app.voiceConnected}
                    voicePanelOpen={app.voicePanelOpen}
                    voiceSessionState={app.voiceSessionState}
                    voiceControlActions={app.voiceControlActions}
                    voiceSettings={app.appSettings.voice}
                    voiceSettingsSaving={app.voiceSettingsSaving}
                    voiceSettingsError={app.voiceSettingsError}
                    onToggleOpen={() => app.setVoicePanelOpen((prev) => !prev)}
                    onDisconnect={() =>
                      app.disconnectVoiceSession({ triggerPaneLeave: false })
                    }
                    onUpdateVoiceSettings={(next) => {
                      void app.setVoiceSettings(next);
                    }}
                    onOpenAdvancedOptions={() =>
                      app.setShowVoiceSettingsModal(true)
                    }
                    onOpenVoiceHardwareTest={() =>
                      app.setUserVoiceHardwareTestOpen(true)
                    }
                    showDiagnostics={app.isPlatformStaff}
                    onParticipantsChange={app.setVoiceParticipants}
                    onConnectionChange={app.setVoiceConnected}
                    onSessionStateChange={app.setVoiceSessionState}
                    onControlActionsReady={app.setVoiceControlActions}
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
                messages={app.messages}
                messageReactions={app.messageReactions}
                messageAttachments={app.messageAttachments}
                messageLinkPreviews={app.messageLinkPreviews}
                authorProfiles={app.authorProfiles}
                currentUserId={user.id}
                canManageMessages={app.serverPermissions.canManageMessages}
                canCreateReports={app.serverPermissions.canCreateReports}
                canManageBans={app.serverPermissions.canManageBans}
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
                onOpenVoiceControls={() => app.setVoicePanelOpen(true)}
                onSendMessage={app.sendMessage}
                onEditMessage={app.editMessage}
                onDeleteMessage={app.deleteMessage}
                onToggleMessageReaction={app.toggleMessageReaction}
                onReportMessage={app.reportMessage}
                onRequestMessageLinkPreviewRefresh={
                  app.requestMessageLinkPreviewRefresh
                }
                hasOlderMessages={app.hasOlderMessages}
                isLoadingOlderMessages={app.isLoadingOlderMessages}
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
                onResolveBanEligibleServers={app.resolveBanEligibleServers}
                onDirectMessageUser={app.directMessageUser}
                onComposerHeightChange={app.setComposerHeight}
                onSendHavenDeveloperMessage={
                  app.canSendHavenDeveloperMessage
                    ? app.sendHavenDeveloperMessage
                    : undefined
                }
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
        notifications={app.notificationItems}
        counts={app.notificationCounts}
        loading={app.notificationsLoading}
        error={app.notificationsError}
        refreshing={app.notificationsRefreshing}
        onRefresh={() => void app.refreshNotificationsManually()}
        onMarkAllSeen={() => void app.markAllNotificationsSeen()}
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
        webPushControls={
          desktopClient.isAvailable()
            ? undefined
            : {
                status: app.webPushStatus,
                loading: app.webPushStatusLoading,
                busy: app.webPushActionBusy,
                error: app.webPushStatusError,
                onRefreshStatus: () => void app.refreshWebPushStatus(),
                onToggleOnThisDevice: () => {
                  if (app.webPushStatus?.webPushSyncEnabled) {
                    void app.disableWebPushOnThisDevice();
                    return;
                  }
                  void app.enableWebPushOnThisDevice();
                },
                testTools: app.webPushTestToolsEnabled
                  ? {
                      busy: app.webPushTestBusy,
                      error: app.webPushTestError,
                      lastResult: app.webPushTestLastResult,
                      onShowServiceWorkerTestNotification: () =>
                        void app.showServiceWorkerTestNotification(),
                      onSimulateNotificationClick: () =>
                        void app.simulateServiceWorkerNotificationClick(),
                      onRunWorkerOnce: () =>
                        void app.runWebPushWorkerOnceForTesting(),
                      onRunWorkerShadowOnce: () =>
                        void app.runWebPushWorkerShadowOnceForTesting(),
                      onRunWorkerWakeupOnce: () =>
                        void app.runWebPushWorkerWakeupOnceForTesting(),
                      diagnostics: {
                        ...((): {
                          backendParitySummary: WebPushBackendTraceParitySummary;
                          backendParityDrift: WebPushBackendTraceParityDriftRow[];
                          cutoverReadiness: WebPushCutoverReadiness;
                        } => {
                          const paritySummary = buildBackendTraceParitySummary(
                            app.webPushBackendTraces,
                          );
                          const parityDrift =
                            buildBackendTraceParityDrift(paritySummary);
                          const queueHealthAlerts =
                            buildWebPushQueueHealthAlerts(
                              app.webPushQueueHealthDiagnostics,
                            );
                          return {
                            backendParitySummary: paritySummary,
                            backendParityDrift: parityDrift,
                            cutoverReadiness: buildWebPushCutoverReadiness({
                              wakeupState: app.webPushWakeupDiagnostics,
                              queueHealthAlerts,
                              backendParitySummary: paritySummary,
                              backendParityDrift: parityDrift,
                            }),
                          };
                        })(),
                        loading: app.webPushDiagnosticsLoading,
                        error: app.webPushDiagnosticsError,
                        devMode: app.webPushRouteDiagnostics?.mode ?? "real",
                        routeMode:
                          app.webPushRouteDiagnostics?.decision.routeMode ??
                          "unknown",
                        routeReasons:
                          app.webPushRouteDiagnostics?.decision.reasonCodes ??
                          [],
                        queueHealthState: app.webPushQueueHealthDiagnostics,
                        queueHealthAlerts: buildWebPushQueueHealthAlerts(
                          app.webPushQueueHealthDiagnostics,
                        ),
                        wakeupState: app.webPushWakeupDiagnostics,
                        backendWakeSourceCounts: buildBackendWakeSourceCounts(
                          app.webPushBackendTraces,
                        ),
                        onSetWakeupConfig: (input) =>
                          void app.updateWebPushWakeupConfigForTesting(input),
                        onRefresh: () => void app.refreshWebPushDiagnostics(),
                        onSetDevMode: (mode) =>
                          void app.setWebPushNotificationDevMode(mode),
                        onSimulateFocused: () =>
                          void app.setNotificationRouteSimulationFocus(true),
                        onSimulateBackground: () =>
                          void app.setNotificationRouteSimulationFocus(false),
                        onClearSimulation: () =>
                          void app.clearNotificationRouteSimulation(),
                        onRecordSimulationTrace: () =>
                          void app.recordNotificationRouteSimulationTrace(),
                        onClearLocalTraces: () =>
                          void app.clearLocalNotificationTraces(),
                        localTraces:
                          app.webPushRouteDiagnostics?.localTraces ?? [],
                        backendTraces: app.webPushBackendTraces,
                      },
                    }
                  : undefined,
              }
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

      {app.dmReportReviewPanelEnabled && user && (
        <DmReportReviewPanel
          open={app.dmReportReviewPanelOpen}
          onOpenChange={app.setDmReportReviewPanelOpen}
          currentUserId={user.id}
          currentUserDisplayName={app.userDisplayName}
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
            channels={app.channels.map((channel) => ({
              id: channel.id,
              name: channel.name,
            }))}
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
            canManageDeveloperAccess={
              app.serverPermissions.canManageDeveloperAccess
            }
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
        canReportProfiles={app.membersModalCanCreateReports}
        canBanProfiles={app.membersModalCanManageBans}
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
        onUpdateSettings={(next) => void app.setVoiceSettings(next)}
        onOpenVoiceHardwareTest={() => app.setUserVoiceHardwareTestOpen(true)}
      />

      <VoiceHardwareDebugPanel
        open={app.userVoiceHardwareTestOpen}
        onOpenChange={app.setUserVoiceHardwareTestOpen}
        hotkeyLabel={null}
        title="Voice Hardware Test"
        description="Test microphone capture and speaker playback locally before joining a voice channel."
        showDebugWorkflow={false}
      />
    </>
  );
}
