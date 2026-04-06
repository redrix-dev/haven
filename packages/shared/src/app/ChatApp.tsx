import React from "react";
import { LoginScreen } from "@shared/features/auth/components/LoginScreen";
import { ServerList } from "@shared/app/components/ServerList";
import { useServerOrder } from "@shared/features/community/hooks/useServerOrder";
import { ChatAppModals } from "@shared/app/components/ChatAppModals";
import { ChatAppDmWorkspace } from "@shared/app/chat-app/ChatAppDmWorkspace";
import { CommunityWorkspaceShell } from "@shared/app/chat-app/CommunityWorkspaceShell";
import { useChatAppVoiceIntegration } from "@shared/app/chat-app/useChatAppVoiceIntegration";
import { useDmStore } from "@shared/stores/dmStore";
import { useServersStore } from "@shared/stores/serversStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import { useUiStore } from "@shared/stores/uiStore";
import { useChatAppOrchestration } from "@shared/app/hooks/useChatAppOrchestration";

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
  const setStoredServers = useServersStore((state) => state.setServers);
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setWorkspaceMode = useNavigationStore(
    (state) => state.setWorkspaceMode,
  );
  const setCurrentServerId = useNavigationStore(
    (state) => state.setCurrentServerId,
  );
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );
  const { orderedServers, setOrder: setServerOrder } = useServerOrder(
    app.user?.id ?? null,
    servers,
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
            <p className="text-[#a9b8cf]">Loading servers...</p>
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
