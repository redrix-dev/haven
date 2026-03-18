import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CreateServerModal } from '@shared/components/CreateServerModal';
import { JoinServerModal } from '@shared/components/JoinServerModal';
import { MobileAccountSettingsSheet } from '@web-mobile/mobile/MobileAccountSettingsSheet';
import { MobileServerSettingsSheet } from '@web-mobile/mobile/MobileServerSettingsSheet';
import { MobileChannelSettingsSheet } from '@web-mobile/mobile/MobileChannelSettingsSheet';
import { MobileLoginScreen } from '@web-mobile/mobile/MobileLoginScreen';
import { MobilePasswordRecoverySheet } from '@web-mobile/mobile/MobilePasswordRecoverySheet';
import { getErrorMessage } from '@platform/lib/errors';
import { useChatAppOrchestration } from '@client/app/hooks/useChatAppOrchestration';
import { MobileSplashScreen } from '@web-mobile/mobile/MobileSplashScreen';
import { MobileHeader } from '@web-mobile/mobile/MobileHeader';
import { MobileServerSubHeader } from '@web-mobile/mobile/MobileServerSubHeader';
import { MobileServerDrawer } from '@web-mobile/mobile/MobileServerDrawer';
import { MobileServerGrid } from '@web-mobile/mobile/MobileServerGrid';
import { MobileChannelSubHeader } from '@web-mobile/mobile/MobileChannelSubHeader';
import { MobileChannelDrawer } from '@web-mobile/mobile/MobileChannelDrawer';
import { MobileChannelView } from '@web-mobile/mobile/MobileChannelView';
import { MobileDmInbox } from '@web-mobile/mobile/MobileDmInbox';
import { MobileDmConversationView } from '@web-mobile/mobile/MobileDmConversationView';
import { MobileNotificationsView } from '@web-mobile/mobile/MobileNotificationsView';
import { MobileNotificationSettingsSheet } from '@web-mobile/mobile/MobileNotificationSettingsSheet';
import { MobileFriendsSheet } from '@web-mobile/mobile/MobileFriendsSheet';
import { MobileVoiceSettingsSheet } from '@web-mobile/mobile/MobileVoiceSettingsSheet';
import { MobileAppShell } from '@web-mobile/mobile/layout/MobileAppShell';
import { useMobileViewport } from '@web-mobile/mobile/layout/MobileViewportContext';
import { useServerOrder } from '@client/features/community/hooks/useServerOrder';

type MobileScreen =
  | 'home'
  | 'server'
  | 'channel'
  | 'dm-inbox'
  | 'dm-conversation'
  | 'notifications';

export function MobileChatApp() {
  const app = useChatAppOrchestration();
  const viewport = useMobileViewport();
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('home');
  const [serverDrawerOpen, setServerDrawerOpen] = useState(false);
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const lastChannelByServer = useRef(new Map<string, string>());

  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    app.servers
  );

  useEffect(() => {
    if (mobileScreen !== 'server') return;
    if (app.channelsLoading) return;

    const textChannels = app.channels.filter((channel) => channel.kind === 'text');

    if (textChannels.length === 0) {
      setMobileScreen('home');
      setServerDrawerOpen(false);
      setChannelDrawerOpen(false);
      toast('No text channels available in this server.', {
        id: 'mobile-no-text-channels',
      });
      return;
    }

    const serverId = app.currentServerId;
    let targetId = serverId ? lastChannelByServer.current.get(serverId) : undefined;

    if (targetId && !textChannels.find((channel) => channel.id === targetId)) {
      targetId = undefined;
    }

    if (!targetId) {
      targetId = textChannels.find((channel) => channel.name === 'general')?.id;
    }

    if (!targetId) {
      targetId = textChannels[0]?.id;
    }

    if (targetId) {
      app.setCurrentChannelId(targetId);
      setMobileScreen('channel');
    }
  }, [app.channels, app.channelsLoading, app.currentServerId, mobileScreen]);

  useEffect(() => {
    if (!notifSettingsOpen) return;
    void app.refreshWebPushStatus();
  }, [app.refreshWebPushStatus, notifSettingsOpen]);

  if (app.authStatus === 'initializing') {
    return (
      <div
        className="flex items-center justify-center bg-[#111a2b] text-white"
        style={{ height: `${viewport.shellHeightPx}px` }}
      >
        Loading...
      </div>
    );
  }

  if (app.authStatus === 'error') {
    return (
      <div
        className="flex items-center justify-center bg-[#111a2b] text-white"
        style={{ height: `${viewport.shellHeightPx}px` }}
      >
        <p>{app.authError ?? 'Authentication failed. Please restart the app.'}</p>
      </div>
    );
  }

  if (!app.user) {
    return <MobileLoginScreen />;
  }

  if (app.isServersLoading && app.servers.length === 0) {
    return <MobileSplashScreen />;
  }

  const goHome = () => {
    app.setWorkspaceMode('community');
    setMobileScreen('home');
    setServerDrawerOpen(false);
    setChannelDrawerOpen(false);
  };

  const goToServer = (id: string) => {
    app.setWorkspaceMode('community');

    const cachedChannelId = app.getDefaultChannelIdForServer(
      id,
      lastChannelByServer.current.get(id) ?? null
    );

    app.setCurrentServerId(id);
    setServerDrawerOpen(false);
    setChannelDrawerOpen(false);

    if (cachedChannelId) {
      app.setCurrentChannelId(cachedChannelId);
      lastChannelByServer.current.set(id, cachedChannelId);
      setMobileScreen('channel');
      return;
    }

    app.setCurrentChannelId(null);
    setMobileScreen('server');
  };

  const goToChannel = (id: string) => {
    app.setWorkspaceMode('community');
    if (app.currentServerId) {
      lastChannelByServer.current.set(app.currentServerId, id);
    }
    app.setCurrentChannelId(id);
    setMobileScreen('channel');
    setChannelDrawerOpen(false);
  };

  const goBack = () => {
    if (mobileScreen === 'channel' || mobileScreen === 'server') {
      app.setCurrentChannelId(null);
      goHome();
      return;
    }

    if (mobileScreen === 'dm-conversation') {
      setMobileScreen('dm-inbox');
      return;
    }

    goHome();
  };

  const inServerContext = mobileScreen === 'server' || mobileScreen === 'channel';
  const canGoBack = mobileScreen !== 'home';
  const canGoHome = mobileScreen !== 'home';
  const notificationUnseenCount = app.notificationCounts.unseenCount;
  const dmUnreadCount = app.dmConversations.filter((conversation) => conversation.unreadCount > 0).length;
  const friendRequestCount = app.socialCounts?.incomingPendingRequestCount ?? 0;
  const selectedConvo =
    app.dmConversations.find(
      (conversation) => conversation.conversationId === app.selectedDmConversationId
    ) ?? null;

  const mobileBody = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {mobileScreen === 'home' && (
        <MobileServerGrid
          servers={orderedServers}
          onSelectServer={goToServer}
          onCreateServer={() => app.setShowCreateModal(true)}
          onJoinServer={() => app.setShowJoinServerModal(true)}
          onReorder={setServerOrder}
        />
      )}

      {mobileScreen === 'server' && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      )}

      {mobileScreen === 'channel' && app.currentChannel && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative shrink-0">
            <MobileChannelSubHeader
              channel={app.currentChannel}
              drawerOpen={channelDrawerOpen}
              onToggle={() => setChannelDrawerOpen((value) => !value)}
            />
            <MobileChannelDrawer
              open={channelDrawerOpen}
              onClose={() => setChannelDrawerOpen(false)}
              channels={app.channels}
              currentChannelId={app.currentChannelId}
              onSelectChannel={goToChannel}
              channelGroups={app.sidebarChannelGroups}
              ungroupedChannelIds={app.channelGroupState.ungroupedChannelIds}
              canOpenChannelSettings={
                app.serverPermissions.canManageChannelStructure ||
                app.serverPermissions.canManageChannelPermissions
              }
              onOpenChannelSettings={(channelId) => {
                void app.openChannelSettingsModal(channelId);
                setChannelDrawerOpen(false);
              }}
              onToggleGroup={(groupId, isCollapsed) => {
                void app.setChannelGroupCollapsed(groupId, isCollapsed);
              }}
            />
          </div>

          <MobileChannelView
            useEnhancedComposer={false}
            channelName={app.currentChannel.name}
            currentUserId={app.user.id}
            messages={app.messages}
            messageReactions={app.messageReactions}
            messageLinkPreviews={app.messageLinkPreviews}
            authorProfiles={app.authorProfiles}
            hasOlderMessages={app.hasOlderMessages}
            isLoadingOlderMessages={app.isLoadingOlderMessages}
            canManageMessages={app.serverPermissions.canManageMessages}
            onRequestOlderMessages={app.requestOlderMessages}
            onSendMessage={app.sendMessage}
            onEditMessage={app.editMessage}
            onDeleteMessage={app.deleteMessage}
            onReportMessage={(messageId) => {
              toast.error('Reporting not yet available on mobile.', {
                id: 'mobile-report',
              });
              void messageId;
            }}
          />
        </div>
      )}

      {mobileScreen === 'dm-inbox' && (
        <MobileDmInbox
          conversations={app.dmConversations}
          loading={app.dmConversationsLoading}
          error={app.dmConversationsError}
          currentUserId={app.user.id}
          onSelectConversation={(conversationId) => {
            app.setWorkspaceMode('dm');
            void app.openDirectMessageConversation(conversationId).catch((error: unknown) => {
              toast.error(getErrorMessage(error, 'Failed to open direct message.'));
            });
            setMobileScreen('dm-conversation');
          }}
          onRefresh={(options) => {
            void app.refreshDmConversations(options);
          }}
          onCompose={() => app.setFriendsPanelOpen(true)}
        />
      )}

      {mobileScreen === 'dm-conversation' && (
        <MobileDmConversationView
          currentUserId={app.user.id}
          conversationTitle={selectedConvo?.otherUsername ?? undefined}
          messages={app.dmMessages}
          loading={app.dmMessagesLoading}
          sendPending={app.dmMessageSendPending}
          error={app.dmMessagesError}
          isMuted={selectedConvo?.isMuted ?? false}
          onSendMessage={app.sendDirectMessage}
          onMuteToggle={(nextMuted) =>
            app.toggleSelectedDmConversationMuted(nextMuted).catch((error: unknown) => {
              toast.error(getErrorMessage(error, 'Failed to update mute status.'));
            })
          }
          onBlock={(input) =>
            app.blockDirectMessageUser(input).catch((error: unknown) => {
              toast.error(getErrorMessage(error, 'Failed to block user.'));
            })
          }
          onReportMessage={(messageId) => {
            toast.error('Reporting not yet available on mobile.', {
              id: 'mobile-dm-report',
            });
            void messageId;
          }}
        />
      )}

      {mobileScreen === 'notifications' && (
        <MobileNotificationsView
          notificationItems={app.notificationItems}
          notificationCounts={app.notificationCounts}
          loading={app.notificationsLoading}
          refreshing={app.notificationsRefreshing}
          error={app.notificationsError}
          onMarkAllSeen={app.markAllNotificationsSeen}
          onMarkRead={app.markNotificationRead}
          onDismiss={app.dismissNotification}
          onAcceptFriendRequest={(recipientId, friendRequestId) => {
            void app
              .acceptFriendRequestFromNotification({ recipientId, friendRequestId })
              .catch((error: unknown) => {
                toast.error(getErrorMessage(error, 'Failed to accept friend request.'));
              });
          }}
          onDeclineFriendRequest={(recipientId, friendRequestId) => {
            void app
              .declineFriendRequestFromNotification({ recipientId, friendRequestId })
              .catch((error: unknown) => {
                toast.error(getErrorMessage(error, 'Failed to decline friend request.'));
              });
          }}
          onOpenItem={(notification) => {
            app.openNotificationItem(notification);
            if (notification.kind === 'dm_message') {
              setMobileScreen('dm-inbox');
            } else {
              goHome();
            }
          }}
          onRefresh={app.refreshNotificationsManually}
          onSettingsPress={() => setNotifSettingsOpen(true)}
        />
      )}
    </div>
  );

  return (
    <MobileAppShell
      primaryHeader={
        <MobileHeader
          canGoBack={canGoBack}
          canGoHome={canGoHome}
          onHomePress={goHome}
          onBackPress={goBack}
          notificationUnseenCount={notificationUnseenCount}
          dmUnreadCount={dmUnreadCount}
          friendRequestCount={friendRequestCount}
          onNotificationsPress={() => {
            app.setWorkspaceMode('community');
            setMobileScreen('notifications');
          }}
          onDmPress={() => {
            setMobileScreen('dm-inbox');
          }}
          onFriendsPress={() => app.setFriendsPanelOpen(true)}
          onAccountPress={() => app.setShowAccountModal(true)}
        />
      }
      secondaryHeader={
        inServerContext && app.currentServer ? (
          <MobileServerSubHeader
            serverName={app.currentServer.name}
            onPress={() => setServerDrawerOpen(true)}
          />
        ) : undefined
      }
      body={mobileBody}
    >
      <MobilePasswordRecoverySheet
        open={app.passwordRecoveryRequired}
        onCompletePasswordRecovery={app.completePasswordRecovery}
        onSignOut={app.signOut}
      />

      <MobileServerDrawer
        open={serverDrawerOpen}
        onClose={() => setServerDrawerOpen(false)}
        servers={orderedServers}
        currentServerId={app.currentServerId}
        onSelectServer={goToServer}
        canManageCurrentServer={app.canManageCurrentServer}
        onOpenServerSettings={() => app.setShowServerSettingsModal(true)}
      />

      {app.friendsSocialPanelEnabled && app.user && (
        <MobileFriendsSheet
          open={app.friendsPanelOpen}
          onOpenChange={(open) => {
            app.setFriendsPanelOpen(open);
            if (!open) app.setFriendsPanelHighlightedRequestId(null);
          }}
          currentUserId={app.user.id}
          currentUserDisplayName={app.userDisplayName}
          onStartDirectMessage={(userId) => {
            void app.directMessageUser(userId);
            setMobileScreen('dm-conversation');
          }}
          requestedTab={app.friendsPanelRequestedTab}
          highlightedRequestId={app.friendsPanelHighlightedRequestId}
        />
      )}

      {app.showCreateModal && (
        <CreateServerModal
          onClose={() => app.setShowCreateModal(false)}
          onCreate={app.createServer}
        />
      )}

      {app.showJoinServerModal && (
        <JoinServerModal
          onClose={() => app.setShowJoinServerModal(false)}
          onJoin={app.joinServerByInvite}
        />
      )}

      <MobileServerSettingsSheet
        open={app.showServerSettingsModal && !!app.currentServerId && app.canOpenServerSettings}
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

      {app.showChannelSettingsModal && app.channelSettingsTarget && (
        <MobileChannelSettingsSheet
          open
          initialName={app.channelSettingsTarget.name}
          initialTopic={app.channelSettingsTarget.topic}
          canDelete={app.channels.length > 1}
          canManageChannelStructure={app.serverPermissions.canManageChannelStructure}
          canManageChannelPermissions={app.serverPermissions.canManageChannelPermissions}
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

      <MobileAccountSettingsSheet
        open={app.showAccountModal && !!app.user}
        userEmail={app.user?.email ?? 'No email'}
        initialUsername={app.baseUserDisplayName}
        initialAvatarUrl={app.profileAvatarUrl}
        autoUpdateEnabled={app.appSettings.autoUpdateEnabled}
        updaterStatus={app.updaterStatus}
        updaterStatusLoading={app.updaterStatusLoading || app.appSettingsLoading}
        checkingForUpdates={app.checkingForUpdates}
        onClose={() => app.setShowAccountModal(false)}
        onSave={app.saveAccountSettings}
        onAutoUpdateChange={app.setAutoUpdateEnabled}
        onCheckForUpdates={app.checkForUpdatesNow}
        onSignOut={app.signOut}
        onDeleteAccount={app.deleteAccount}
        onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
      />

      <MobileVoiceSettingsSheet
        open={voiceSettingsOpen}
        onClose={() => setVoiceSettingsOpen(false)}
        settings={app.appSettings.voice}
        saving={app.voiceSettingsSaving}
        error={app.voiceSettingsError}
        onUpdateSettings={(next) => void app.setVoiceSettings(next)}
      />

      <MobileNotificationSettingsSheet
        open={notifSettingsOpen}
        onClose={() => setNotifSettingsOpen(false)}
        notificationPreferences={app.notificationPreferences}
        notificationPreferencesLoading={app.notificationPreferencesLoading}
        notificationPreferencesSaving={app.notificationPreferencesSaving}
        onSavePreferences={app.saveNotificationPreferences}
        webPushStatus={app.webPushStatus}
        webPushStatusLoading={app.webPushStatusLoading}
        webPushActionBusy={app.webPushActionBusy}
        webPushStatusError={app.webPushStatusError}
        onEnablePush={app.enableWebPushOnThisDevice}
        onDisablePush={app.disableWebPushOnThisDevice}
      />
    </MobileAppShell>
  );
}
