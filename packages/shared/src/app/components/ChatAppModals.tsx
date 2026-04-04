import React from "react";
import type { User } from "@supabase/supabase-js";
import { CreateServerModal } from "@shared/features/community/components/CreateServerModal";
import { CreateChannelModal } from "@shared/features/community/components/CreateChannelModal";
import { JoinServerModal } from "@shared/features/community/components/JoinServerModal";
import { AccountSettingsModal } from "@shared/features/profile/components/AccountSettingsModal";
import { QuickRenameDialog } from "@shared/features/community/components/QuickRenameDialog";
import { ServerMembersModal } from "@shared/features/community/components/ServerMembersModal";
import { ServerSettingsModal } from "@shared/features/community/components/ServerSettingsModal";
import { ChannelSettingsModal } from "@shared/features/community/components/ChannelSettingsModal";
import { VoiceHardwareDebugPanel } from "@shared/features/voice/components/VoiceHardwareDebugPanel";
import { VoiceSettingsModal } from "@shared/features/voice/components/VoiceSettingsModal";
import { NotificationCenterModal } from "@shared/features/notifications/components/NotificationCenterModal";
import { FriendsModal } from "@shared/features/social/components/FriendsModal";
import { ServerModmailPanel } from "@shared/features/moderation/components/ServerModmailPanel";
import { PasswordRecoveryDialog } from "@shared/features/auth/components/PasswordRecoveryDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/app/ui/alert-dialog";
import { getErrorMessage } from "@platform/lib/errors";
import { VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL } from "@shared/app/constants";
import { getPendingUiConfirmationCopy } from "@shared/app/ui-confirmations";
import { toast } from "sonner";
import { useChatAppOrchestration } from "@shared/app/hooks/useChatAppOrchestration";
import { useVoiceSessionController } from "@shared/features/voice/hooks/useVoiceSessionController";
import { useUiStore } from "@shared/stores/uiStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";

type ChatAppController = ReturnType<typeof useChatAppOrchestration>;
type VoiceSessionApi = ReturnType<typeof useVoiceSessionController>;

export type ChatAppModalsProps = {
  app: ChatAppController;
  user: User;
  managedReportServers: Array<{ id: string; name: string }>;
  voiceSession: VoiceSessionApi;
  visibleActiveVoiceParticipants: VoiceSessionApi["state"]["participants"];
  canOpenVoicePopout: boolean;
  canKickVoiceParticipants: boolean;
  handleOpenVoicePopout: () => void;
  handleKickVoiceParticipant: (
    targetUserId: string,
    displayName: string,
  ) => Promise<void>;
};

export function ChatAppModals({
  app,
  user,
  managedReportServers,
  voiceSession,
  visibleActiveVoiceParticipants,
  canOpenVoicePopout,
  canKickVoiceParticipants,
  handleOpenVoicePopout,
  handleKickVoiceParticipant,
}: ChatAppModalsProps) {
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );
  const notificationsPanelOpen = useNotificationsStore(
    (state) => state.isPanelOpen,
  );
  const setNotificationsPanelOpen = useNotificationsStore(
    (state) => state.setIsPanelOpen,
  );

  const showCreateModal = useUiStore((state) => state.showCreateModal);
  const setShowCreateModal = useUiStore((state) => state.setShowCreateModal);
  const showCreateChannelModal = useUiStore(
    (state) => state.showCreateChannelModal,
  );
  const setShowCreateChannelModal = useUiStore(
    (state) => state.setShowCreateChannelModal,
  );
  const showJoinServerModal = useUiStore((state) => state.showJoinServerModal);
  const setShowJoinServerModal = useUiStore(
    (state) => state.setShowJoinServerModal,
  );
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );
  const setShowServerSettingsModal = useUiStore(
    (state) => state.setShowServerSettingsModal,
  );
  const showChannelSettingsModal = useUiStore(
    (state) => state.showChannelSettingsModal,
  );
  const setShowChannelSettingsModal = useUiStore(
    (state) => state.setShowChannelSettingsModal,
  );
  const setChannelSettingsTargetId = useUiStore(
    (state) => state.setChannelSettingsTargetId,
  );
  const showAccountModal = useUiStore((state) => state.showAccountModal);
  const setShowAccountModal = useUiStore((state) => state.setShowAccountModal);
  const showVoiceSettingsModal = useUiStore(
    (state) => state.showVoiceSettingsModal,
  );
  const setShowVoiceSettingsModal = useUiStore(
    (state) => state.setShowVoiceSettingsModal,
  );
  const userVoiceHardwareTestOpen = useUiStore(
    (state) => state.userVoiceHardwareTestOpen,
  );
  const setUserVoiceHardwareTestOpen = useUiStore(
    (state) => state.setUserVoiceHardwareTestOpen,
  );
  const serverModmailOpen = useUiStore((state) => state.serverModmailOpen);
  const setServerModmailOpen = useUiStore(
    (state) => state.setServerModmailOpen,
  );
  const pendingUiConfirmation = useUiStore(
    (state) => state.pendingUiConfirmation,
  );
  const setPendingUiConfirmation = useUiStore(
    (state) => state.setPendingUiConfirmation,
  );
  const pendingUiConfirmationCopy = React.useMemo(
    () => getPendingUiConfirmationCopy(pendingUiConfirmation),
    [pendingUiConfirmation],
  );
  const renameServerDraft = useUiStore((state) => state.renameServerDraft);
  const setRenameServerDraft = useUiStore((state) => state.setRenameServerDraft);
  const renameChannelDraft = useUiStore((state) => state.renameChannelDraft);
  const setRenameChannelDraft = useUiStore(
    (state) => state.setRenameChannelDraft,
  );
  const renameGroupDraft = useUiStore((state) => state.renameGroupDraft);
  const setRenameGroupDraft = useUiStore((state) => state.setRenameGroupDraft);
  const createGroupDraft = useUiStore((state) => state.createGroupDraft);
  const setCreateGroupDraft = useUiStore((state) => state.setCreateGroupDraft);

  const canManageChannelStructure = serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  return (
    <>
      <PasswordRecoveryDialog
        open={app.passwordRecoveryRequired}
        onCompletePasswordRecovery={app.completePasswordRecovery}
        onSignOut={app.signOut}
      />

      {notificationsPanelOpen && (
        <NotificationCenterModal
          open={notificationsPanelOpen}
          onOpenChange={setNotificationsPanelOpen}
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
      )}
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
          open={serverModmailOpen}
          onOpenChange={setServerModmailOpen}
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
        open={Boolean(pendingUiConfirmation)}
        onOpenChange={(open) => {
          if (!open) setPendingUiConfirmation(null);
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUiConfirmationCopy.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingUiConfirmationCopy.description}
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
                pendingUiConfirmationCopy.isDestructive
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-[#3f79d8] hover:bg-[#325fae] text-white"
              }
            >
              {pendingUiConfirmationCopy.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={app.createServer}
        />
      )}

      {showCreateChannelModal &&
        currentServerId &&
        serverPermissions.canCreateChannels && (
          <CreateChannelModal
            onClose={() => setShowCreateChannelModal(false)}
            onCreate={app.createChannel}
          />
        )}

      {showJoinServerModal && (
        <JoinServerModal
          onClose={() => setShowJoinServerModal(false)}
          onJoin={app.joinServerByInvite}
        />
      )}

      {showServerSettingsModal &&
        currentServerId &&
        app.canOpenServerSettings && (
          <ServerSettingsModal
            initialValues={app.serverSettingsInitialValues}
            loadingInitialValues={app.serverSettingsLoading}
            initialLoadError={app.serverSettingsLoadError}
            canManageServer={serverPermissions.canManageServer}
            canManageRoles={serverPermissions.canManageRoles}
            canManageMembers={serverPermissions.canManageMembers}
            canManageBans={serverPermissions.canManageBans}
            isOwner={serverPermissions.isOwner}
            roles={app.serverRoles}
            members={app.serverMembers}
            permissionsCatalog={app.serverPermissionCatalog}
            roleManagementLoading={app.serverRoleManagementLoading}
            roleManagementError={app.serverRoleManagementError}
            canManageInvites={serverPermissions.canManageInvites}
            invites={app.serverInvites}
            invitesLoading={app.serverInvitesLoading}
            invitesError={app.serverInvitesError}
            bans={app.communityBans}
            bansLoading={app.communityBansLoading}
            bansError={app.communityBansError}
            inviteBaseUrl={app.getPlatformInviteBaseUrl()}
            onClose={() => setShowServerSettingsModal(false)}
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

      {showChannelSettingsModal &&
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
              setShowChannelSettingsModal(false);
              setChannelSettingsTargetId(null);
            }}
            onSave={app.saveChannelSettings}
            onDelete={app.deleteCurrentChannel}
            onSaveRolePermissions={app.saveRoleChannelPermissions}
            onSaveMemberPermissions={app.saveMemberChannelPermissions}
          />
        )}
      {app.showMembersModal && (
        <ServerMembersModal
          open={app.showMembersModal}
          currentUserId={user?.id ?? null}
          serverName={app.membersModalServerName}
          loading={app.membersModalLoading}
          error={app.membersModalError}
          members={app.membersModalMembers}
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
      )}
      {Boolean(renameServerDraft) && (
        <QuickRenameDialog
          open={Boolean(renameServerDraft)}
          title="Rename Community"
          initialValue={renameServerDraft?.currentName ?? ""}
          confirmLabel="Rename"
          onClose={() => setRenameServerDraft(null)}
          onConfirm={async (value) => {
            if (!renameServerDraft) return;
            await app.renameServer(renameServerDraft.serverId, value);
            setRenameServerDraft(null);
          }}
        />
      )}
      {Boolean(renameChannelDraft) && (
        <QuickRenameDialog
          open={Boolean(renameChannelDraft)}
          title="Rename Channel"
          initialValue={renameChannelDraft?.currentName ?? ""}
          confirmLabel="Rename"
          onClose={() => setRenameChannelDraft(null)}
          onConfirm={async (value) => {
            if (!renameChannelDraft) return;
            await app.renameChannel(renameChannelDraft.channelId, value);
            setRenameChannelDraft(null);
          }}
        />
      )}
      {Boolean(renameGroupDraft) && (
        <QuickRenameDialog
          open={Boolean(renameGroupDraft)}
          title="Rename Channel Group"
          initialValue={renameGroupDraft?.currentName ?? ""}
          confirmLabel="Rename"
          onClose={() => setRenameGroupDraft(null)}
          onConfirm={async (value) => {
            if (!renameGroupDraft) return;
            await app.renameChannelGroup(renameGroupDraft.groupId, value);
            setRenameGroupDraft(null);
          }}
        />
      )}
      {Boolean(createGroupDraft) && (
        <QuickRenameDialog
          open={Boolean(createGroupDraft)}
          title="Create Channel Group"
          initialValue=""
          confirmLabel="Create"
          onClose={() => setCreateGroupDraft(null)}
          onConfirm={async (value) => {
            await app.createChannelGroup(
              value,
              createGroupDraft?.channelId ?? null,
            );
            setCreateGroupDraft(null);
          }}
        />
      )}

      {showAccountModal && (
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
          onClose={() => setShowAccountModal(false)}
          onSave={app.saveAccountSettings}
          onOpenVoiceSettings={() => setShowVoiceSettingsModal(true)}
          onAutoUpdateChange={app.setAutoUpdateEnabled}
          onCheckForUpdates={app.checkForUpdatesNow}
          onSignOut={app.signOut}
          onDeleteAccount={app.deleteAccount}
        />
      )}
      {showVoiceSettingsModal && (
        <VoiceSettingsModal
          open={showVoiceSettingsModal}
          onOpenChange={setShowVoiceSettingsModal}
          settings={app.appSettings.voice}
          saving={app.voiceSettingsSaving}
          error={app.voiceSettingsError}
          activeChannelName={app.activeVoiceChannel?.name ?? null}
          currentUserDisplayName={app.userDisplayName}
          currentUserAvatarUrl={app.profileAvatarUrl}
          voiceSessionState={{
            ...voiceSession.state,
            participants: visibleActiveVoiceParticipants,
          }}
          voiceSessionActions={voiceSession.actions}
          showDiagnostics={app.isPlatformStaff}
          canOpenVoicePopout={canOpenVoicePopout}
          canKickParticipants={canKickVoiceParticipants}
          onDisconnect={() => {
            void app.disconnectVoiceSession();
          }}
          onOpenVoicePopout={handleOpenVoicePopout}
          onOpenVoiceHardwareTest={() => setUserVoiceHardwareTestOpen(true)}
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
      )}
      {userVoiceHardwareTestOpen && (
        <VoiceHardwareDebugPanel
          open={userVoiceHardwareTestOpen}
          onOpenChange={setUserVoiceHardwareTestOpen}
          hotkeyLabel={null}
          title="Voice Hardware Test"
          description="Test microphone capture and speaker playback locally before joining a voice channel."
          showDebugWorkflow={false}
        />
      )}
    </>
  );
}
