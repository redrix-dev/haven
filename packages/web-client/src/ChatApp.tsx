import React, { useCallback, useEffect, useRef } from "react";
import { bootLogger } from "@shared/debug/bootLogger";
import { LiveKitAudioRenderer } from "@web-client/features/voice/LiveKitAudioRenderer";
import { LoginScreen } from "@web-client/components/auth/LoginScreen";
import { BootSplash } from "@web-client/components/BootSplash";
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
import { useActiveCommunityId, useOrderedCommunities } from "@react-bindings";

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
  const currentServerId = useActiveCommunityId(core.communities);
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
  const orderedCommunities = useOrderedCommunities(core.communities);
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

  // Fire once when the workspace is first fully interactive (auth done + servers loaded).
  const firedInteractiveRef = useRef(false);
  useEffect(() => {
    if (
      !firedInteractiveRef.current &&
      app.authStatus === "authenticated" &&
      !app.isServersLoading
    ) {
      firedInteractiveRef.current = true;
      bootLogger.mark("ui-interactive");
    }
  }, [app.authStatus, app.isServersLoading]);

  // ── Splash overlay ───────────────────────────────────────────────────────
  // Show during the auth check and the subsequent server/cache bootstrap.
  // A single persistent instance means the auth→loading phase switch is
  // seamless — no unmount/remount flash between the two message pools.
  const splashVisible =
    app.authStatus === "initializing" ||
    (app.authStatus === "authenticated" && app.isServersLoading);
  const splashPhase = app.authStatus === "initializing" ? "auth" : "loading";

  // ── Auth error ───────────────────────────────────────────────────────────
  if (app.authStatus === "error") {
    return (
      <div className="flex items-center justify-center h-full bg-surface-app text-white">
        <p>
          {app.authError ?? "Authentication failed. Please restart the app."}
        </p>
      </div>
    );
  }

  // ── Pre-auth / unauthenticated ───────────────────────────────────────────
  // While initializing: render the splash only (no content underneath).
  // After initializing with no user: fade the splash out, show login screen.
  if (!app.user) {
    return (
      <>
        {app.authStatus !== "initializing" && <LoginScreen />}
        <BootSplash visible={splashVisible} phase={splashPhase} />
      </>
    );
  }

  const { user } = app;

  // ── Authenticated ────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex h-full overflow-hidden bg-surface-app text-foreground">
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
          // Splash covers this area during loading — render nothing so the
          // workspace shell doesn't partially paint beneath the overlay.
          null
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

      {/* Boot splash — fixed overlay, fades out once servers are loaded. */}
      <BootSplash visible={splashVisible} phase={splashPhase} />
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
