import React, { useCallback } from "react";
import { LoginScreen } from "@web-client/components/auth/LoginScreen";
import { ServerList } from "@web-client/components/ServerList";
import { useServerOrder } from "@shared/features/community/hooks/useServerOrder";
import { ChatAppModals } from "@web-client/components/ChatAppModals";
import { ChatAppDmWorkspace } from "@web-client/chat-app/ChatAppDmWorkspace";
import { CommunityWorkspaceShell } from "@web-client/chat-app/CommunityWorkspaceShell";
import { useChatAppVoiceIntegration } from "@web-client/chat-app/useChatAppVoiceIntegration";
import { useUiStore } from "@shared/stores/uiStore";
import { useHavenCore } from "@shared/core";
import { useChatAppOrchestration } from "@web-client/hooks/useChatAppOrchestration";

export function ChatApp() {
  const app = useChatAppOrchestration();
  const voice = useChatAppVoiceIntegration(app);
  const totalDmUnreadCount = React.useMemo(
    () => app.dmConversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [app.dmConversations],
  );
  const core = useHavenCore();
  const currentServerId = core.communities.useActiveId();
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const setCurrentServerId = useCallback(
    (id: string | null) => {
      core.communities.setActiveId(id);
    },
    [core],
  );
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    app.servers,
  );
  const managedReportServers = React.useMemo(
    () =>
      orderedServers
        .filter((server) => app.managedReportServerIds.includes(server.id))
        .map((server) => ({ id: server.id, name: server.name })),
    [app.managedReportServerIds, orderedServers],
  );

  if (app.authStatus === "initializing") {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-app text-white">
        Loading...
      </div>
    );
  }

  if (app.authStatus === "error") {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-app text-white">
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
      <div className="flex h-screen overflow-hidden bg-surface-app text-foreground">
        <ServerList
          servers={orderedServers}
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
            useUiStore.getState().setNotificationsPanelOpen(true)
          }
          notificationUnseenCount={app.notificationCounts.unseenCount}
          notificationHasUnseenPulse={app.notificationCounts.unseenCount > 0}
          onOpenDirectMessages={app.openDirectMessagesWorkspace}
          directMessagesActive={app.dmWorkspaceIsActive}
          directMessageUnreadCount={totalDmUnreadCount}
          onOpenFriends={() => {
            app.setFriendsPanelRequestedTab(null);
            app.setFriendsPanelHighlightedRequestId(null);
            app.setFriendsPanelOpen(true);
          }}
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
          <ChatAppDmWorkspace app={app} user={user} />
        ) : app.isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading servers...</p>
          </div>
        ) : (
          <CommunityWorkspaceShell app={app} user={user} voice={voice} />
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
