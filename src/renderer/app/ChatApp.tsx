import React from 'react';
import { LoginScreen } from '@/components/LoginScreen';
import { ServerList } from '@/components/ServerList';
import { CreateServerModal } from '@/components/CreateServerModal';
import { CreateChannelModal } from '@/components/CreateChannelModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
import { QuickRenameDialog } from '@/components/QuickRenameDialog';
import { ServerMembersModal } from '@/components/ServerMembersModal';
import { ServerSettingsModal } from '@/components/ServerSettingsModal';
import { ChannelSettingsModal } from '@/components/ChannelSettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { VoiceChannelPane } from '@/components/VoiceChannelPane';
import { VoiceHardwareDebugPanel } from '@/components/VoiceHardwareDebugPanel';
import { VoiceSettingsModal } from '@/components/VoiceSettingsModal';
import { NotificationCenterModal } from '@/components/NotificationCenterModal';
import { FriendsModal } from '@/components/FriendsModal';
import { DirectMessagesSidebar } from '@/components/DirectMessagesSidebar';
import { DirectMessageArea } from '@/components/DirectMessageArea';
import { DmReportReviewPanel } from '@/components/DmReportReviewPanel';
import { PasswordRecoveryDialog } from '@/components/PasswordRecoveryDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import { VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL } from '@/renderer/app/constants';
import { useChatAppOrchestration } from '@/renderer/app/hooks/useChatAppOrchestration';
import {
  WebPushCutoverReadiness,
  WebPushBackendTraceParitySummary,
  WebPushBackendTraceParityDriftRow,
  buildBackendTraceParityDrift,
  buildBackendTraceParitySummary,
  buildBackendWakeSourceCounts,
  buildWebPushCutoverReadiness,
  buildWebPushQueueHealthAlerts,
} from '@/lib/notifications/webPushDiagnostics';
import { Headphones, Mic, MicOff, PhoneOff, Settings2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

export function ChatApp() {
  const app = useChatAppOrchestration();

  if (app.authStatus === 'initializing') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        Loading...
      </div>
    );
  }

  if (app.authStatus === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        <p>{app.authError ?? 'Authentication failed. Please restart the app.'}</p>
      </div>
    );
  }

  if (!app.user) {
    return <LoginScreen />;
  }

  const { user } = app;

  return (
    <>
      <PasswordRecoveryDialog
        open={app.passwordRecoveryRequired}
        onCompletePasswordRecovery={app.completePasswordRecovery}
        onSignOut={app.signOut}
      />

      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          servers={app.servers}
          currentServerId={app.currentServerId}
          currentServerIsOwner={app.serverPermissions.isOwner}
          canManageCurrentServer={app.canManageCurrentServer}
          canOpenCurrentServerSettings={app.canOpenServerSettings}
          onServerClick={(serverId) => {
            app.setWorkspaceMode('community');
            app.setCurrentServerId(serverId);
          }}
          onCreateServer={() => app.setShowCreateModal(true)}
          onJoinServer={() => app.setShowJoinServerModal(true)}
          onOpenNotifications={() => app.setNotificationsPanelOpen(true)}
          notificationUnseenCount={app.notificationCounts.unseenCount}
          notificationHasUnseenPulse={app.notificationCounts.unseenCount > 0}
          onOpenDirectMessages={app.dmWorkspaceEnabled ? app.openDirectMessagesWorkspace : undefined}
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
          friendRequestIncomingCount={app.socialCounts.incomingPendingRequestCount}
          friendRequestHasPendingPulse={app.socialCounts.incomingPendingRequestCount > 0}
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
                app.setSelectedDmConversationId(conversationId);
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
                  <div className="px-2 pt-2 pb-1 border-b border-[#22334f]">
                    <div className="rounded-md border border-[#304867] bg-[#142033] px-2 py-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">Voice Connected</p>
                          <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                            <Headphones className="size-3.5" />
                            {app.activeVoiceChannel.name}
                          </p>
                          <p className="text-[11px] text-[#95a5bf] truncate">{app.currentServer.name}</p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            app.voiceConnected
                              ? 'bg-[#2f9f73]/20 text-[#6dd5a6]'
                              : 'bg-[#44546f]/40 text-[#b5c4de]'
                          }`}
                        >
                          {app.voiceConnected ? 'Live' : 'Connecting'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {!app.voiceSessionState.joined ? (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => app.voiceControlActions?.join()}
                            disabled={app.voiceSessionState.joining || !app.voiceControlActions}
                            className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                          >
                            <Headphones className="size-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => app.voiceControlActions?.toggleMute()}
                              disabled={app.voiceSessionState.listenOnly || !app.voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                app.voiceSessionState.isMuted
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              {app.voiceSessionState.isMuted ? (
                                <MicOff className="size-4" />
                              ) : (
                                <Mic className="size-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => app.voiceControlActions?.toggleDeafen()}
                              disabled={!app.voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                app.voiceSessionState.isDeafened
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              <VolumeX className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => app.setVoicePanelOpen((prev) => !prev)}
                          className={`hover:text-white hover:bg-[#22334f] ${
                            app.voicePanelOpen ? 'text-white' : 'text-[#a9b8cf]'
                          }`}
                        >
                          <Settings2 className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => app.disconnectVoiceSession()}
                          className="text-[#f0b0b0] hover:text-[#ffd1d1] hover:bg-[#3b2535]"
                        >
                          <PhoneOff className="size-4" />
                        </Button>
                        <div className="ml-auto text-[11px] text-[#95a5bf]">
                          {app.activeVoiceParticipantCount} in call
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null
              }
              footerStatusActions={
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => app.setShowVoiceSettingsModal(true)}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                  aria-label="Open voice settings"
                  title="Voice Settings"
                >
                  <Headphones className="size-3.5" />
                  <span>Voice</span>
                </Button>
              }
              onCreateChannel={
                app.serverPermissions.canCreateChannels
                  ? () => app.setShowCreateChannelModal(true)
                  : undefined
              }
              canManageChannels={app.serverPermissions.canManageChannels}
              onRenameChannel={
                app.serverPermissions.canManageChannels ? app.handleRenameChannel : undefined
              }
              onDeleteChannel={
                app.serverPermissions.canManageChannels ? app.handleDeleteChannel : undefined
              }
              onOpenChannelSettings={
                app.serverPermissions.canManageChannels
                  ? (channelId) => {
                      void app.openChannelSettingsModal(channelId);
                    }
                  : undefined
              }
              onAddChannelToGroup={
                app.serverPermissions.canManageChannels
                  ? (channelId, groupId) => {
                      void app.assignChannelToGroup(channelId, groupId).catch((error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to assign channel to group.'), {
                          id: 'assign-channel-group-error',
                        });
                      });
                    }
                  : undefined
              }
              onRemoveChannelFromGroup={
                app.serverPermissions.canManageChannels
                  ? (channelId) => {
                      void app.removeChannelFromGroup(channelId).catch((error: unknown) => {
                        toast.error(
                          getErrorMessage(error, 'Failed to remove channel from group.'),
                          { id: 'remove-channel-group-error' }
                        );
                      });
                    }
                  : undefined
              }
              onCreateChannelGroup={
                app.serverPermissions.canManageChannels
                  ? app.handleCreateChannelGroup
                  : undefined
              }
              onToggleChannelGroup={(groupId, isCollapsed) => {
                void app.setChannelGroupCollapsed(groupId, isCollapsed).catch((error: unknown) => {
                  console.error('Failed to persist channel group collapse state:', error);
                });
              }}
              onRenameChannelGroup={
                app.serverPermissions.canManageChannels ? app.handleRenameChannelGroup : undefined
              }
              onDeleteChannelGroup={
                app.serverPermissions.canManageChannels ? app.handleDeleteChannelGroup : undefined
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
                communityId={app.currentServer.id}
                channelId={app.currentRenderableChannel.id}
                channelName={app.currentRenderableChannel.name}
                channelKind={app.currentRenderableChannel.kind}
                currentUserDisplayName={app.userDisplayName}
                messages={app.messages}
                messageReactions={app.messageReactions}
                messageAttachments={app.messageAttachments}
                messageLinkPreviews={app.messageLinkPreviews}
                authorProfiles={app.authorProfiles}
                currentUserId={user.id}
                canSpeakInVoiceChannel={app.canSpeakInVoiceChannel}
                canManageMessages={app.serverPermissions.canManageMessages}
                canCreateReports={app.serverPermissions.canCreateReports}
                canManageBans={app.serverPermissions.canManageBans}
                canRefreshLinkPreviews={app.serverPermissions.canRefreshLinkPreviews}
                showVoiceDiagnostics={app.isPlatformStaff}
                onOpenChannelSettings={
                  app.serverPermissions.canManageChannels
                    ? () => void app.openChannelSettingsModal(app.currentRenderableChannel!.id)
                    : undefined
                }
                onOpenVoiceControls={() => app.setVoicePanelOpen(true)}
                onSendMessage={app.sendMessage}
                onEditMessage={app.editMessage}
                onDeleteMessage={app.deleteMessage}
                onToggleMessageReaction={app.toggleMessageReaction}
                onReportMessage={app.reportMessage}
                onRequestMessageLinkPreviewRefresh={app.requestMessageLinkPreviewRefresh}
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
                  app.canSendHavenDeveloperMessage ? app.sendHavenDeveloperMessage : undefined
                }
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">
                  {app.channelsError ?? 'No channels yet. Create one to get started!'}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">
              {app.serversError ?? 'No servers yet. Create one to get started!'}
            </p>
          </div>
        )}
      </div>

      {app.currentServer && app.activeVoiceChannel && (
        <div
          className={`fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${
            app.voicePanelOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!app.voicePanelOpen}
        >
          <div
            className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
              app.voicePanelOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => app.setVoicePanelOpen(false)}
          />
          <div
            className={`relative z-10 w-full max-w-4xl max-h-[88vh] rounded-lg border border-[#304867] bg-[#111a2b] shadow-2xl overflow-hidden transition-all duration-200 ${
              app.voicePanelOpen ? 'translate-y-0 scale-100' : 'translate-y-3 scale-[0.98]'
            }`}
          >
            <div className="scrollbar-inset max-h-[88vh] overflow-y-auto">
              <VoiceChannelPane
                communityId={app.currentServer.id}
                channelId={app.activeVoiceChannel.id}
                channelName={app.activeVoiceChannel.name}
                currentUserId={user.id}
                currentUserDisplayName={app.userDisplayName}
                canSpeak={app.canSpeakInVoiceChannel}
                voiceSettings={app.appSettings.voice}
                voiceSettingsSaving={app.voiceSettingsSaving}
                voiceSettingsError={app.voiceSettingsError}
                onUpdateVoiceSettings={(next) => {
                  void app.setVoiceSettings(next);
                }}
                onOpenVoiceSettings={() => app.setShowVoiceSettingsModal(true)}
                onOpenVoiceHardwareTest={() => app.setUserVoiceHardwareTestOpen(true)}
                showDiagnostics={app.isPlatformStaff}
                autoJoin
                onParticipantsChange={app.setVoiceParticipants}
                onConnectionChange={app.setVoiceConnected}
                onSessionStateChange={app.setVoiceSessionState}
                onControlActionsReady={app.setVoiceControlActions}
                onLeave={() => app.disconnectVoiceSession({ triggerPaneLeave: false })}
              />
            </div>
          </div>
        </div>
      )}

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
        onMarkNotificationRead={(recipientId) => void app.markNotificationRead(recipientId)}
        onDismissNotification={(recipientId) => void app.dismissNotification(recipientId)}
        onOpenNotificationItem={(notification) => void app.openNotificationItem(notification)}
        onAcceptFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void app.acceptFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        onDeclineFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void app.declineFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        preferences={app.notificationPreferences}
        preferencesLoading={app.notificationPreferencesLoading}
        preferencesSaving={app.notificationPreferencesSaving}
        preferencesError={app.notificationPreferencesError}
        onUpdatePreferences={(next) => void app.saveNotificationPreferences(next)}
        localAudioSettings={app.appSettings.notifications}
        localAudioSaving={app.notificationAudioSettingsSaving}
        localAudioError={app.notificationAudioSettingsError}
        onUpdateLocalAudioSettings={(next) => void app.setNotificationAudioSettings(next)}
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
                      onRunWorkerOnce: () => void app.runWebPushWorkerOnceForTesting(),
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
                            app.webPushBackendTraces
                          );
                          const parityDrift = buildBackendTraceParityDrift(paritySummary);
                          const queueHealthAlerts = buildWebPushQueueHealthAlerts(
                            app.webPushQueueHealthDiagnostics
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
                        devMode: app.webPushRouteDiagnostics?.mode ?? 'real',
                        routeMode: app.webPushRouteDiagnostics?.decision.routeMode ?? 'unknown',
                        routeReasons: app.webPushRouteDiagnostics?.decision.reasonCodes ?? [],
                        queueHealthState: app.webPushQueueHealthDiagnostics,
                        queueHealthAlerts: buildWebPushQueueHealthAlerts(
                          app.webPushQueueHealthDiagnostics
                        ),
                        wakeupState: app.webPushWakeupDiagnostics,
                        backendWakeSourceCounts: buildBackendWakeSourceCounts(
                          app.webPushBackendTraces
                        ),
                        onSetWakeupConfig: (input) =>
                          void app.updateWebPushWakeupConfigForTesting(input),
                        onRefresh: () => void app.refreshWebPushDiagnostics(),
                        onSetDevMode: (mode) => void app.setWebPushNotificationDevMode(mode),
                        onSimulateFocused: () =>
                          void app.setNotificationRouteSimulationFocus(true),
                        onSimulateBackground: () =>
                          void app.setNotificationRouteSimulationFocus(false),
                        onClearSimulation: () => void app.clearNotificationRouteSimulation(),
                        onRecordSimulationTrace: () =>
                          void app.recordNotificationRouteSimulationTrace(),
                        onClearLocalTraces: () => void app.clearLocalNotificationTraces(),
                        localTraces: app.webPushRouteDiagnostics?.localTraces ?? [],
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
              {app.voiceJoinPrompt?.mode === 'switch'
                ? 'Switch voice channel?'
                : 'Join voice channel?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {app.voiceJoinPrompt?.mode === 'switch'
                ? 'You are already connected to voice. Switching will move your session to the new channel.'
                : 'Join this voice channel now? You can keep browsing text channels while connected.'}
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
              {app.voiceJoinPrompt?.mode === 'switch' ? 'Switch' : 'Join'}
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
            <AlertDialogTitle>{app.pendingUiConfirmationTitle}</AlertDialogTitle>
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
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-[#3f79d8] hover:bg-[#325fae] text-white'
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

      {app.showCreateChannelModal && app.currentServerId && app.serverPermissions.canCreateChannels && (
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

      {app.showServerSettingsModal && app.currentServerId && app.canOpenServerSettings && (
        <ServerSettingsModal
          channels={app.channels.map((channel) => ({ id: channel.id, name: channel.name }))}
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
          canManageDeveloperAccess={app.serverPermissions.canManageDeveloperAccess}
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
        app.serverPermissions.canManageChannels && (
          <ChannelSettingsModal
            initialName={app.channelSettingsTarget.name}
            initialTopic={app.channelSettingsTarget.topic}
            canDelete={app.channels.length > 1}
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
        title="Rename Server"
        initialValue={app.renameServerDraft?.currentName ?? ''}
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
        initialValue={app.renameChannelDraft?.currentName ?? ''}
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
        initialValue={app.renameGroupDraft?.currentName ?? ''}
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
          await app.createChannelGroup(value, app.createGroupDraft?.channelId ?? null);
          app.setCreateGroupDraft(null);
        }}
      />

      {app.showAccountModal && (
        <AccountSettingsModal
          userEmail={user.email ?? 'No email'}
          initialUsername={app.baseUserDisplayName}
          initialAvatarUrl={app.profileAvatarUrl}
          autoUpdateEnabled={app.appSettings.autoUpdateEnabled}
          updaterStatus={app.updaterStatus}
          updaterStatusLoading={app.updaterStatusLoading || app.appSettingsLoading}
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
