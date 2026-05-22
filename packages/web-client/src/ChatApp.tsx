import React, { useCallback } from "react";
import { LiveKitAudioRenderer } from "@web-client/features/voice/LiveKitAudioRenderer";
import { LoginScreen } from "@web-client/components/auth/LoginScreen";
import { ServerList } from "@web-client/components/ServerList";
import { ChatAppModals } from "@web-client/components/ChatAppModals";
import { ChatAppDmWorkspace } from "@web-client/chat-app/ChatAppDmWorkspace";
import { CommunityWorkspaceShell } from "@web-client/chat-app/CommunityWorkspaceShell";
import { useChatAppVoiceIntegration } from "@web-client/chat-app/useChatAppVoiceIntegration";
import {
  ChatAppSessionProvider,
  useChatAppSession,
} from "@web-client/chat-app/ChatAppSession";
import { useUiStore } from "@shared/stores/uiStore";
import { useHavenCore, toServerSummaries } from "@shared/core";

function ChatAppInner() {
  const app = useChatAppSession();
  const voice = useChatAppVoiceIntegration();
  const core = useHavenCore();
  const dmConversations = core.directMessages.useConversations();
  const notificationCounts = core.notifications.useCounts();
  const totalDmUnreadCount = React.useMemo(
    () =>
      dmConversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    [dmConversations],
  );
  const currentServerId = core.communities.useActiveId();
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const setCurrentServerId = useCallback(
    (id: string | null) => {
      core.communities.setActiveId(id);
    },
    [core],
  );
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;
  const orderedCommunities = core.communities.useOrderedCommunities();
  const orderedServers = React.useMemo(
    () => toServerSummaries(orderedCommunities),
    [orderedCommunities],
  );
  const setServerOrder = useCallback(
    (ids: string[]) => {
      core.setCommunityDisplayOrder(ids);
    },
    [core],
  );
  const managedReportServers = React.useMemo(
    () =>
      orderedServers
        .filter((server) => app.managedReportServerIds.includes(server.id))
        .map((server) => ({ id: server.id, name: server.name })),
    [app.managedReportServerIds, orderedServers],
  );
  const dmWorkspaceIsActive = useUiStore((state) => state.workspaceMode === "dm");

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

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-surface-app text-foreground">
        <ServerList
          servers={orderedServers}
          onReorder={setServerOrder}
          currentServerIsOwner={serverPermissions.isOwner}
          canManageCurrentServer={
            serverPermissions.isOwner || serverPermissions.canManageServer
          }
          canOpenCurrentServerSettings={canOpenServerSettings}
          onServerClick={(serverId) => {
            setWorkspaceMode("community");
            setCurrentServerId(serverId);
          }}
          onCreateServer={() => useUiStore.getState().setShowCreateModal(true)}
          onJoinServer={() => useUiStore.getState().setShowJoinServerModal(true)}
          onOpenNotifications={() =>
            useUiStore.getState().setNotificationsPanelOpen(true)
          }
          notificationUnseenCount={notificationCounts.unseenCount}
          notificationHasUnseenPulse={notificationCounts.unseenCount > 0}
          onOpenDirectMessages={app.openDirectMessagesWorkspace}
          directMessagesActive={dmWorkspaceIsActive}
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
            void core.admin.openServerMembersModal(serverId);
          }}
          onLeaveServer={app.handleLeaveServer}
          onDeleteServer={app.handleDeleteServer}
          onRenameServer={app.handleRenameServer}
          onOpenServerSettingsForServer={(serverId) => {
            void core.admin.openServerSettingsModal(serverId);
          }}
        />

        {dmWorkspaceIsActive ? (
          <ChatAppDmWorkspace user={user} />
        ) : app.isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading servers...</p>
          </div>
        ) : (
          <CommunityWorkspaceShell user={user} voice={voice} />
        )}
      </div>
      <ChatAppModals
        user={user}
        managedReportServers={managedReportServers}
        voiceSession={voice.voiceController}
        visibleActiveVoiceParticipants={voice.visibleActiveVoiceParticipants}
        canOpenVoicePopout={voice.canOpenVoicePopout}
        canKickVoiceParticipants={voice.canKickVoiceParticipants}
        handleOpenVoicePopout={voice.handleOpenVoicePopout}
        handleKickVoiceParticipant={voice.handleKickVoiceParticipant}
      />
      {/* Renders one hidden <audio> per subscribed remote participant. */}
      <LiveKitAudioRenderer room={voice.livekitRoom} />
    </>
  );
}

export function ChatApp() {
  return (
    <ChatAppSessionProvider>
      <ChatAppInner />
    </ChatAppSessionProvider>
  );
}
