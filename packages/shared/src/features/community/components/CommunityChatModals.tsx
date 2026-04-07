import React from "react";
import type { User } from "@supabase/supabase-js";
import { CreateServerModal } from "@shared/features/community/components/CreateServerModal";
import { CreateChannelModal } from "@shared/features/community/components/CreateChannelModal";
import { JoinServerModal } from "@shared/features/community/components/JoinServerModal";
import { QuickRenameDialog } from "@shared/features/community/components/QuickRenameDialog";
import { ServerMembersModal } from "@shared/features/community/components/ServerMembersModal";
import { ServerSettingsModal } from "@shared/features/community/components/ServerSettingsModal";
import { ChannelSettingsModal } from "@shared/features/community/components/ChannelSettingsModal";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";

type CommunityChatModalsProps = {
  app: ChatAppOrchestrationApi;
  user: User;
  ui: ChatAppModalUiState;
};

export function CommunityChatModals({
  app,
  user,
  ui,
}: CommunityChatModalsProps) {
  const {
    currentServerId,
    serverPermissions,
    showCreateModal,
    setShowCreateModal,
    showCreateChannelModal,
    setShowCreateChannelModal,
    showJoinServerModal,
    setShowJoinServerModal,
    showServerSettingsModal,
    setShowServerSettingsModal,
    showChannelSettingsModal,
    setShowChannelSettingsModal,
    setChannelSettingsTargetId,
    renameServerDraft,
    setRenameServerDraft,
    renameChannelDraft,
    setRenameChannelDraft,
    renameGroupDraft,
    setRenameGroupDraft,
    createGroupDraft,
    setCreateGroupDraft,
    canManageChannelStructure,
    canManageChannelPermissions,
    canOpenChannelSettings,
  } = ui;

  return (
    <>
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
    </>
  );
}
