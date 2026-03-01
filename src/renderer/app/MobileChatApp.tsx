import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LoginScreen } from '@/components/LoginScreen';
import { CreateServerModal } from '@/components/CreateServerModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { MobileAccountSettingsSheet } from '@/renderer/mobile/MobileAccountSettingsSheet';
import { ServerSettingsModal } from '@/components/ServerSettingsModal';
import { getErrorMessage } from '@/shared/lib/errors';
import { useChatAppOrchestration } from '@/renderer/app/hooks/useChatAppOrchestration';
import { MobileSplashScreen } from '@/renderer/mobile/MobileSplashScreen';
import { MobileHeader } from '@/renderer/mobile/MobileHeader';
import { MobileServerSubHeader } from '@/renderer/mobile/MobileServerSubHeader';
import { MobileServerDrawer } from '@/renderer/mobile/MobileServerDrawer';
import { MobileServerGrid } from '@/renderer/mobile/MobileServerGrid';
import { MobileBottomNav } from '@/renderer/mobile/MobileBottomNav';
import { MobileChannelSubHeader } from '@/renderer/mobile/MobileChannelSubHeader';
import { MobileChannelDrawer } from '@/renderer/mobile/MobileChannelDrawer';
import { MobileChannelView } from '@/renderer/mobile/MobileChannelView';
import { MobileDmInbox } from '@/renderer/mobile/MobileDmInbox';
import { MobileDmConversationView } from '@/renderer/mobile/MobileDmConversationView';
import { MobileNotificationsView } from '@/renderer/mobile/MobileNotificationsView';
import { MobileNotificationSettingsSheet } from '@/renderer/mobile/MobileNotificationSettingsSheet';
import { MobileFriendsSheet } from '@/renderer/mobile/MobileFriendsSheet';

// Explicit mobile navigation — independent of orchestration's currentServerId so that
// useCommunityWorkspace's desktop auto-select doesn't interfere.
// 'server' is a transient loading state: auto-navigates to a channel once channels load.
type MobileScreen =
  | 'home'
  | 'server'
  | 'channel'
  | 'dm-inbox'
  | 'dm-conversation'
  | 'notifications';

export function MobileChatApp() {
  const app = useChatAppOrchestration();
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('home');
  const [serverDrawerOpen, setServerDrawerOpen] = useState(false);
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [bottomNavOpen, setBottomNavOpen] = useState(false);

  // Remember the last channel visited per server so we can restore it on re-entry.
  const lastChannelByServer = useRef(new Map<string, string>());

  // ── Auto-navigate from 'server' loading state once channels are available ──
  // Must be declared before any early returns to satisfy the Rules of Hooks.
  useEffect(() => {
    if (mobileScreen !== 'server') return;
    if (app.channelsLoading) return;

    const textChannels = app.channels.filter((c) => c.kind === 'text');

    // No text channels available (voice-only server or empty server) — bail to home.
    if (textChannels.length === 0) {
      setMobileScreen('home');
      setServerDrawerOpen(false);
      setChannelDrawerOpen(false);
      toast('No text channels available in this server.', { id: 'mobile-no-text-channels' });
      return;
    }

    const serverId = app.currentServerId;
    let targetId = serverId ? lastChannelByServer.current.get(serverId) : undefined;
    // Invalidate saved channel if it no longer exists in the current list
    if (targetId && !textChannels.find((c) => c.id === targetId)) targetId = undefined;
    // Fallback: 'general' → first text channel
    if (!targetId) targetId = textChannels.find((c) => c.name === 'general')?.id;
    if (!targetId) targetId = textChannels[0]?.id;

    if (targetId) {
      app.setCurrentChannelId(targetId);
      setMobileScreen('channel');
    }
  }, [mobileScreen, app.channels, app.channelsLoading, app.currentServerId]);

  // ── Auth guards (after all hooks) ─────────────────────────────────────────
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
  if (!app.user) return <LoginScreen />;

  // Splash while servers load on first mount
  if (app.isServersLoading && app.servers.length === 0) {
    return <MobileSplashScreen />;
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goHome = () => {
    app.setWorkspaceMode('community');
    setMobileScreen('home');
    setServerDrawerOpen(false);
    setChannelDrawerOpen(false);
  };

  const goToServer = (id: string) => {
    app.setWorkspaceMode('community');
    // Try to resolve the channel from cache so we can skip the 'server' spinner entirely.
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
      setMobileScreen('channel'); // channels already cached — skip spinner
    } else {
      app.setCurrentChannelId(null);
      setMobileScreen('server'); // no cache — show spinner, useEffect navigates when loaded
    }
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
    } else if (mobileScreen === 'dm-conversation') {
      setMobileScreen('dm-inbox');
    } else {
      goHome();
    }
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const inServerContext = mobileScreen === 'server' || mobileScreen === 'channel';
  const canGoBack = mobileScreen !== 'home';
  const canGoHome = mobileScreen !== 'home';

  const notificationUnseenCount = app.notificationCounts.unseenCount;
  const dmUnreadCount = app.dmConversations.filter((dm) => dm.unreadCount > 0).length;
  const friendRequestCount = app.socialCounts?.incomingPendingRequestCount ?? 0;
  const username = app.profileUsername ?? app.user.email?.split('@')[0] ?? 'User';

  const selectedConvo = app.dmConversations.find(
    (c) => c.conversationId === app.selectedDmConversationId
  ) ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  // The mobile shell follows the visual viewport while the keyboard is open.
  return (
    <div
      className="flex flex-col bg-[#111a2b] overflow-hidden"
      style={{ height: 'var(--app-visual-viewport-height, 100dvh)' }}
    >

      {/* ── Main nav header — always visible, "Haven" centered ────────────── */}
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
          app.setWorkspaceMode('dm');
          setMobileScreen('dm-inbox');
        }}
        onFriendsPress={() => app.setFriendsPanelOpen(true)}
      />

      {/* ── Server sub-header — server name, clickable, only when in server context ── */}
      {inServerContext && app.currentServer && (
        <MobileServerSubHeader
          serverName={app.currentServer.name}
          onPress={() => setServerDrawerOpen(true)}
        />
      )}

      <MobileServerDrawer
        open={serverDrawerOpen}
        onClose={() => setServerDrawerOpen(false)}
        servers={app.servers}
        currentServerId={app.currentServerId}
        onSelectServer={goToServer}
        canManageCurrentServer={app.canManageCurrentServer}
        onOpenServerSettings={() => app.setShowServerSettingsModal(true)}
      />

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {mobileScreen === 'home' && (
          <MobileServerGrid
            servers={app.servers}
            onSelectServer={goToServer}
            onCreateServer={() => app.setShowCreateModal(true)}
            onJoinServer={() => app.setShowJoinServerModal(true)}
          />
        )}

        {/* 'server' = transient loading state while channels are fetched */}
        {mobileScreen === 'server' && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        )}

        {mobileScreen === 'channel' && app.currentChannel && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Channel sub-header: channel name (left-aligned) + drawer toggle */}
            <div className="relative shrink-0">
              <MobileChannelSubHeader
                channel={app.currentChannel}
                drawerOpen={channelDrawerOpen}
                onToggle={() => setChannelDrawerOpen((v) => !v)}
              />
              <MobileChannelDrawer
                open={channelDrawerOpen}
                onClose={() => setChannelDrawerOpen(false)}
                channels={app.channels}
                currentChannelId={app.currentChannelId}
                onSelectChannel={goToChannel}
              />
            </div>

            <MobileChannelView
              channelName={app.currentChannel.name}
              currentUserId={app.user.id}
              currentUserDisplayName={app.userDisplayName}
              messages={app.messages}
              messageReactions={app.messageReactions}
              messageAttachments={app.messageAttachments}
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
                toast.error('Reporting not yet available on mobile.', { id: 'mobile-report' });
                void messageId;
              }}
            />
          </div>
        )}

        {mobileScreen === 'dm-inbox' && (
          <MobileDmInbox
            conversations={app.dmConversations}
            loading={app.dmConversationsLoading}
            refreshing={app.dmConversationsRefreshing}
            error={app.dmConversationsError}
            currentUserId={app.user.id}
            onSelectConversation={(conversationId) => {
              app.setSelectedDmConversationId(conversationId);
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
            refreshing={app.dmMessagesRefreshing}
            sendPending={app.dmMessageSendPending}
            error={app.dmMessagesError}
            isMuted={selectedConvo?.isMuted ?? false}
            onSendMessage={app.sendDirectMessage}
            onRefresh={() => {
              if (!app.selectedDmConversationId) return;
              void app.refreshDmMessages(app.selectedDmConversationId, {
                suppressLoadingState: true,
                markRead: true,
              });
            }}
            onMuteToggle={(nextMuted) => app.toggleSelectedDmConversationMuted(nextMuted).catch((err: unknown) => {
              toast.error(getErrorMessage(err, 'Failed to update mute status.'));
            })}
            onBlock={(input) => app.blockDirectMessageUser(input).catch((err: unknown) => {
              toast.error(getErrorMessage(err, 'Failed to block user.'));
            })}
            onReportMessage={(messageId) => {
              toast.error('Reporting not yet available on mobile.', { id: 'mobile-dm-report' });
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
              void app.acceptFriendRequestFromNotification({ recipientId, friendRequestId }).catch((err: unknown) => {
                toast.error(getErrorMessage(err, 'Failed to accept friend request.'));
              });
            }}
            onDeclineFriendRequest={(recipientId, friendRequestId) => {
              void app.declineFriendRequestFromNotification({ recipientId, friendRequestId }).catch((err: unknown) => {
                toast.error(getErrorMessage(err, 'Failed to decline friend request.'));
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

      {/* Bottom nav — only on home screen */}
      {mobileScreen === 'home' && (
        <MobileBottomNav
          mode="home"
          open={bottomNavOpen}
          onToggle={() => setBottomNavOpen((v) => !v)}
          username={username}
          onAccountSettings={() => app.setShowAccountModal(true)}
          onSignOut={() => void app.signOut()}
          channels={[]}
          currentChannelId={null}
          onSelectChannel={() => {}}
        />
      )}

      {/* ── Global overlays ───────────────────────────────────────────────── */}

      {/* Friends sheet — mobile-native, replaces desktop FriendsModal */}
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

      {app.showServerSettingsModal && app.currentServerId && app.canOpenServerSettings && (
        <ServerSettingsModal
          channels={app.channels.map((c) => ({ id: c.id, name: c.name }))}
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
        onEnablePush={app.enableWebPushOnThisDevice}
        onDisablePush={app.disableWebPushOnThisDevice}
      />
    </div>
  );
}
