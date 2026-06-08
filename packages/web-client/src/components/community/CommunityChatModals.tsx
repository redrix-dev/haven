import React, { useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { CreateServerModal } from "@web-client/components/community/CreateServerModal";
import { CreateChannelModal } from "@web-client/components/community/CreateChannelModal";
import { JoinServerModal } from "@web-client/components/community/JoinServerModal";
import { QuickRenameDialog } from "@web-client/components/community/QuickRenameDialog";
import { ServerMembersModal } from "@web-client/components/community/ServerMembersModal";
import { ServerSettingsModal } from "@web-client/components/community/ServerSettingsModal";
import { ChannelSettingsModal } from "@web-client/components/community/ChannelSettingsModal";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";
import { useHavenCore, toChannel } from "@shared/core";
import { useChannels } from "@mobile-data/hooks";
import { getPlatformInviteBaseUrl } from "@platform/urls";

type CommunityChatModalsProps = {
  user: User;
};

export function CommunityChatModals({ user }: CommunityChatModalsProps) {
  const app = useChatAppSession();
  const core = useHavenCore();
  const admin = core.admin;
  const membersModal = admin.useMembersModalState();
  const serverPanel = admin.useServerPanelState();
  const channelPermissions = admin.useChannelPermissionsState();
  const ui = useChatAppModalUiState();
  const {
    currentServerId,
    currentChannelId,
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
    channelSettingsTargetId,
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

  const havenChannels = useChannels(core.channels, currentServerId ?? "__none__");
  const channels = useMemo(
    () => havenChannels.map(toChannel),
    [havenChannels],
  );

  const channelSettingsTarget = useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.id === (channelSettingsTargetId ?? currentChannelId),
      ) ?? null,
    [channels, channelSettingsTargetId, currentChannelId],
  );

  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;

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
            onCreate={admin.createChannel}
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
        canOpenServerSettings && (
          <ServerSettingsModal
            initialValues={serverPanel.serverSettingsInitialValues}
            loadingInitialValues={serverPanel.serverSettingsLoading}
            initialLoadError={serverPanel.serverSettingsLoadError}
            canManageServer={serverPermissions.canManageServer}
            canManageRoles={serverPermissions.canManageRoles}
            canManageMembers={serverPermissions.canManageMembers}
            canManageBans={serverPermissions.canManageBans}
            isOwner={serverPermissions.isOwner}
            roles={serverPanel.serverRoles}
            members={serverPanel.serverMembers}
            permissionsCatalog={serverPanel.serverPermissionCatalog}
            roleManagementLoading={serverPanel.serverRoleManagementLoading}
            roleManagementError={serverPanel.serverRoleManagementError}
            canManageInvites={serverPermissions.canManageInvites}
            invites={serverPanel.serverInvites}
            invitesLoading={serverPanel.serverInvitesLoading}
            invitesError={serverPanel.serverInvitesError}
            bans={serverPanel.communityBans}
            bansLoading={serverPanel.communityBansLoading}
            bansError={serverPanel.communityBansError}
            inviteBaseUrl={getPlatformInviteBaseUrl()}
            onClose={() => setShowServerSettingsModal(false)}
            onSave={admin.saveServerSettings}
            onCreateRole={admin.createServerRole}
            onUpdateRole={admin.updateServerRole}
            onDeleteRole={admin.deleteServerRole}
            onSaveRolePermissions={admin.saveServerRolePermissions}
            onSaveMemberRoles={admin.saveServerMemberRoles}
            onCreateInvite={admin.createServerInvite}
            onRevokeInvite={admin.revokeServerInvite}
            onUnbanUser={admin.unbanUserFromCurrentServer}
          />
        )}

      {showChannelSettingsModal &&
        channelSettingsTarget &&
        canOpenChannelSettings && (
          <ChannelSettingsModal
            initialName={channelSettingsTarget.name}
            initialTopic={channelSettingsTarget.topic}
            canDelete={channels.length > 1}
            canManageChannelStructure={canManageChannelStructure}
            canManageChannelPermissions={canManageChannelPermissions}
            rolePermissions={channelPermissions.channelRolePermissions}
            memberPermissions={channelPermissions.channelMemberPermissions}
            availableMembers={channelPermissions.channelPermissionMemberOptions}
            permissionsLoading={channelPermissions.channelPermissionsLoading}
            permissionsLoadError={channelPermissions.channelPermissionsLoadError}
            onClose={() => {
              setShowChannelSettingsModal(false);
              setChannelSettingsTargetId(null);
            }}
            onSave={admin.saveChannelSettings}
            onDelete={admin.deleteCurrentChannel}
            onSaveRolePermissions={admin.saveRoleChannelPermissions}
            onSaveMemberPermissions={app.saveMemberChannelPermissions}
          />
        )}
      {membersModal.showMembersModal && (
        <ServerMembersModal
          open={membersModal.showMembersModal}
          currentUserId={user?.id ?? null}
          serverName={membersModal.membersModalServerName}
          loading={membersModal.membersModalLoading}
          error={membersModal.membersModalError}
          members={membersModal.membersModalMembers}
          isElevatedViewer={app.isCurrentUserElevatedInMembersModalServer}
          canReportProfiles={membersModal.membersModalCanCreateReports}
          canBanProfiles={membersModal.membersModalCanManageBans}
          canKickProfiles={membersModal.membersModalCanManageMembers}
          onResolveBanServers={app.resolveBanEligibleServers}
          onDirectMessage={app.directMessageUser}
          onReportUser={async (targetUserId, reason) => {
            if (!membersModal.membersModalCommunityId) return;
            await app.reportUserProfile({
              targetUserId,
              reason,
              communityId: membersModal.membersModalCommunityId,
            });
          }}
          onBanUser={async (targetUserId, communityId, reason) => {
            await app.banUserFromServer({ targetUserId, communityId, reason });
          }}
          onKickUser={async (targetUserId, username) => {
            if (!membersModal.membersModalCommunityId) return;
            await app.kickUserFromServer({
              targetUserId,
              username,
              communityId: membersModal.membersModalCommunityId,
            });
          }}
          onClose={admin.closeMembersModal}
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
            await admin.renameServer(renameServerDraft.serverId, value);
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
            await admin.renameChannel(renameChannelDraft.channelId, value);
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
