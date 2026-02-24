import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import type { ControlPlaneBackend } from '@/lib/backend/controlPlaneBackend';
import type {
  CommunityBanItem,
  CommunityMemberListItem,
  DeveloperAccessMode,
  PermissionCatalogItem,
  ServerInvite,
  ServerMemberRoleItem,
  ServerRoleItem,
  ServerSettingsUpdate,
  ServerSummary,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

type UseServerAdminInput = {
  servers: ServerSummary[];
  controlPlaneBackend: ControlPlaneBackend;
  currentServerId: string | null;
  currentUserId: string | null;
  canManageDeveloperAccess: boolean;
  isServerSettingsModalOpen: boolean;
  refreshServers: () => Promise<void>;
  onActiveServerRemoved: () => void;
};

export function useServerAdmin({
  servers,
  controlPlaneBackend,
  currentServerId,
  currentUserId,
  canManageDeveloperAccess,
  isServerSettingsModalOpen,
  refreshServers,
  onActiveServerRemoved,
}: UseServerAdminInput) {
  const [showMembersModal, setShowMembersModal] = React.useState(false);
  const [membersModalCommunityId, setMembersModalCommunityId] = React.useState<string | null>(null);
  const [membersModalServerName, setMembersModalServerName] = React.useState('');
  const [membersModalMembers, setMembersModalMembers] = React.useState<CommunityMemberListItem[]>([]);
  const [membersModalLoading, setMembersModalLoading] = React.useState(false);
  const [membersModalError, setMembersModalError] = React.useState<string | null>(null);
  const [membersModalCanCreateReports, setMembersModalCanCreateReports] = React.useState(false);
  const [membersModalCanManageBans, setMembersModalCanManageBans] = React.useState(false);
  const [communityBans, setCommunityBans] = React.useState<CommunityBanItem[]>([]);
  const [communityBansLoading, setCommunityBansLoading] = React.useState(false);
  const [communityBansError, setCommunityBansError] = React.useState<string | null>(null);
  const [serverInvites, setServerInvites] = React.useState<ServerInvite[]>([]);
  const [serverInvitesLoading, setServerInvitesLoading] = React.useState(false);
  const [serverInvitesError, setServerInvitesError] = React.useState<string | null>(null);
  const [serverRoles, setServerRoles] = React.useState<ServerRoleItem[]>([]);
  const [serverMembers, setServerMembers] = React.useState<ServerMemberRoleItem[]>([]);
  const [serverPermissionCatalog, setServerPermissionCatalog] = React.useState<PermissionCatalogItem[]>([]);
  const [serverRoleManagementLoading, setServerRoleManagementLoading] = React.useState(false);
  const [serverRoleManagementError, setServerRoleManagementError] = React.useState<string | null>(null);
  const [serverSettingsInitialValues, setServerSettingsInitialValues] =
    React.useState<ServerSettingsUpdate | null>(null);
  const [serverSettingsLoading, setServerSettingsLoading] = React.useState(false);
  const [serverSettingsLoadError, setServerSettingsLoadError] = React.useState<string | null>(null);

  const resetMembersModal = React.useCallback(() => {
    setShowMembersModal(false);
    setMembersModalCommunityId(null);
    setMembersModalServerName('');
    setMembersModalMembers([]);
    setMembersModalLoading(false);
    setMembersModalError(null);
    setMembersModalCanCreateReports(false);
    setMembersModalCanManageBans(false);
  }, []);

  const closeMembersModal = React.useCallback(() => {
    setShowMembersModal(false);
    setMembersModalCommunityId(null);
    setMembersModalMembers([]);
    setMembersModalError(null);
    setMembersModalCanCreateReports(false);
    setMembersModalCanManageBans(false);
  }, []);

  const resetCommunityBans = React.useCallback(() => {
    setCommunityBans([]);
    setCommunityBansLoading(false);
    setCommunityBansError(null);
  }, []);

  const clearCommunityBansError = React.useCallback(() => {
    setCommunityBansError(null);
  }, []);

  const resetServerInvites = React.useCallback(() => {
    setServerInvites([]);
    setServerInvitesLoading(false);
    setServerInvitesError(null);
  }, []);

  const clearServerInvitesError = React.useCallback(() => {
    setServerInvitesError(null);
  }, []);

  const resetServerRoleManagement = React.useCallback(() => {
    setServerRoles([]);
    setServerMembers([]);
    setServerPermissionCatalog([]);
    setServerRoleManagementLoading(false);
    setServerRoleManagementError(null);
  }, []);

  const clearServerRoleManagementError = React.useCallback(() => {
    setServerRoleManagementError(null);
  }, []);

  const resetServerSettingsState = React.useCallback(() => {
    setServerSettingsInitialValues(null);
    setServerSettingsLoading(false);
    setServerSettingsLoadError(null);
  }, []);

  const clearServerSettingsLoadError = React.useCallback(() => {
    setServerSettingsLoadError(null);
  }, []);

  const refreshMembersModalMembers = React.useCallback(async (communityId: string) => {
    const communityBackend = getCommunityDataBackend(communityId);
    const members = await communityBackend.listCommunityMembers(communityId);
    setMembersModalMembers(members);
  }, []);

  const refreshMembersModalMembersIfOpen = React.useCallback(
    async (communityId: string) => {
      if (!showMembersModal || membersModalCommunityId !== communityId) return;
      await refreshMembersModalMembers(communityId);
    },
    [membersModalCommunityId, refreshMembersModalMembers, showMembersModal]
  );

  const openServerMembersModal = React.useCallback(
    async (communityId: string) => {
      const server = servers.find((candidate) => candidate.id === communityId);
      setShowMembersModal(true);
      setMembersModalCommunityId(communityId);
      setMembersModalServerName(server?.name ?? 'Server');
      setMembersModalMembers([]);
      setMembersModalError(null);
      setMembersModalLoading(true);
      setMembersModalCanCreateReports(false);
      setMembersModalCanManageBans(false);

      try {
        const communityBackend = getCommunityDataBackend(communityId);
        const [members, permissions] = await Promise.all([
          communityBackend.listCommunityMembers(communityId),
          communityBackend.fetchServerPermissions(communityId),
        ]);
        setMembersModalMembers(members);
        setMembersModalCanCreateReports(Boolean(permissions.canCreateReports));
        setMembersModalCanManageBans(Boolean(permissions.canManageBans));
      } catch (error: unknown) {
        setMembersModalError(getErrorMessage(error, 'Failed to load server members.'));
      } finally {
        setMembersModalLoading(false);
      }
    },
    [servers]
  );

  const loadCommunityBans = React.useCallback(
    async (communityId = currentServerId) => {
      if (!communityId) {
        setCommunityBans([]);
        setCommunityBansError(null);
        return;
      }

      setCommunityBansLoading(true);
      setCommunityBansError(null);
      try {
        const communityBackend = getCommunityDataBackend(communityId);
        const bans = await communityBackend.listCommunityBans(communityId);
        setCommunityBans(bans);
      } catch (error: unknown) {
        setCommunityBans([]);
        setCommunityBansError(getErrorMessage(error, 'Failed to load bans.'));
        throw error;
      } finally {
        setCommunityBansLoading(false);
      }
    },
    [currentServerId]
  );

  const loadServerInvites = React.useCallback(
    async (communityId = currentServerId) => {
      if (!communityId) {
        setServerInvites([]);
        setServerInvitesError(null);
        return;
      }

      setServerInvitesLoading(true);
      setServerInvitesError(null);
      try {
        const invites = await controlPlaneBackend.listActiveCommunityInvites(communityId);
        setServerInvites(
          invites.map((invite) => ({
            id: invite.id,
            code: invite.code,
            currentUses: invite.currentUses,
            maxUses: invite.maxUses,
            expiresAt: invite.expiresAt,
            isActive: invite.isActive,
          }))
        );
      } finally {
        setServerInvitesLoading(false);
      }
    },
    [controlPlaneBackend, currentServerId]
  );

  const loadServerRoleManagement = React.useCallback(
    async (communityId = currentServerId) => {
      if (!communityId) {
        setServerRoles([]);
        setServerMembers([]);
        setServerPermissionCatalog([]);
        return;
      }

      setServerRoleManagementLoading(true);
      setServerRoleManagementError(null);

      try {
        const communityBackend = getCommunityDataBackend(communityId);
        const snapshot = await communityBackend.fetchServerRoleManagement(communityId);
        setServerRoles(snapshot.roles);
        setServerMembers(snapshot.members);
        setServerPermissionCatalog(snapshot.permissionsCatalog);
      } finally {
        setServerRoleManagementLoading(false);
      }
    },
    [currentServerId]
  );

  const loadServerSettings = React.useCallback(
    async (communityId = currentServerId) => {
      if (!communityId) {
        setServerSettingsInitialValues(null);
        return;
      }

      setServerSettingsLoadError(null);
      setServerSettingsLoading(true);

      try {
        const communityBackend = getCommunityDataBackend(communityId);
        const snapshot = await communityBackend.fetchServerSettings(communityId);
        setServerSettingsInitialValues({
          name: snapshot.name,
          description: snapshot.description,
          allowPublicInvites: snapshot.allowPublicInvites,
          requireReportReason: snapshot.requireReportReason,
          developerAccessEnabled: snapshot.developerAccessEnabled,
          developerAccessMode: snapshot.developerAccessMode as DeveloperAccessMode,
          developerAccessChannelIds: snapshot.developerAccessChannelIds,
        });
      } finally {
        setServerSettingsLoading(false);
      }
    },
    [currentServerId]
  );

  const createServerInvite = React.useCallback(
    async (values: { maxUses: number | null; expiresInHours: number | null }): Promise<ServerInvite> => {
      if (!currentServerId) throw new Error('No server selected.');

      const invite = await controlPlaneBackend.createCommunityInvite({
        communityId: currentServerId,
        maxUses: values.maxUses,
        expiresInHours: values.expiresInHours,
      });

      await loadServerInvites();

      return {
        id: invite.id,
        code: invite.code,
        currentUses: invite.currentUses,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt,
        isActive: invite.isActive,
      };
    },
    [controlPlaneBackend, currentServerId, loadServerInvites]
  );

  const saveServerSettings = React.useCallback(
    async (values: ServerSettingsUpdate) => {
      if (!currentServerId || !currentUserId) throw new Error('Not authenticated');

      const trimmedName = values.name.trim();
      if (!trimmedName) {
        throw new Error('Server name is required.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.updateServerSettings({
        communityId: currentServerId,
        userId: currentUserId,
        values: {
          name: trimmedName,
          description: values.description,
          allowPublicInvites: values.allowPublicInvites,
          requireReportReason: values.requireReportReason,
          developerAccessEnabled: values.developerAccessEnabled,
          developerAccessMode: values.developerAccessMode,
          developerAccessChannelIds: values.developerAccessChannelIds,
        },
        canManageDeveloperAccess,
      });

      await refreshServers();
      await loadServerSettings();
    },
    [
      canManageDeveloperAccess,
      currentServerId,
      currentUserId,
      loadServerSettings,
      refreshServers,
    ]
  );

  const revokeServerInvite = React.useCallback(
    async (inviteId: string): Promise<void> => {
      if (!currentServerId) throw new Error('No server selected.');

      await controlPlaneBackend.revokeCommunityInvite(currentServerId, inviteId);
      await loadServerInvites();
    },
    [controlPlaneBackend, currentServerId, loadServerInvites]
  );

  const unbanUserFromCurrentServer = React.useCallback(
    async (input: { targetUserId: string; reason?: string | null }) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.unbanCommunityMember({
        communityId: currentServerId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });

      await loadCommunityBans(currentServerId);
      await refreshMembersModalMembersIfOpen(currentServerId);
    },
    [currentServerId, loadCommunityBans, refreshMembersModalMembersIfOpen]
  );

  const createServerRole = React.useCallback(
    async (input: { name: string; color: string; position: number }) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.createServerRole({
        communityId: currentServerId,
        name: input.name,
        color: input.color,
        position: input.position,
      });

      await loadServerRoleManagement();
    },
    [currentServerId, loadServerRoleManagement]
  );

  const updateServerRole = React.useCallback(
    async (input: { roleId: string; name: string; color: string; position: number }) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.updateServerRole({
        communityId: currentServerId,
        roleId: input.roleId,
        name: input.name,
        color: input.color,
        position: input.position,
      });

      await loadServerRoleManagement();
    },
    [currentServerId, loadServerRoleManagement]
  );

  const deleteServerRole = React.useCallback(
    async (roleId: string) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.deleteServerRole({
        communityId: currentServerId,
        roleId,
      });

      await loadServerRoleManagement();
    },
    [currentServerId, loadServerRoleManagement]
  );

  const saveServerRolePermissions = React.useCallback(
    async (roleId: string, permissionKeys: string[]) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.saveServerRolePermissions({
        roleId,
        permissionKeys,
      });

      await loadServerRoleManagement();
    },
    [currentServerId, loadServerRoleManagement]
  );

  const saveServerMemberRoles = React.useCallback(
    async (memberId: string, roleIds: string[]) => {
      if (!currentServerId || !currentUserId) throw new Error('Not authenticated');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.saveServerMemberRoles({
        communityId: currentServerId,
        memberId,
        roleIds,
        assignedByUserId: currentUserId,
      });

      await loadServerRoleManagement();
    },
    [currentServerId, currentUserId, loadServerRoleManagement]
  );

  const leaveServer = React.useCallback(
    async (communityId: string) => {
      await controlPlaneBackend.leaveCommunity(communityId);
      if (currentServerId === communityId) {
        onActiveServerRemoved();
        closeMembersModal();
      }
      await refreshServers();
    },
    [
      closeMembersModal,
      controlPlaneBackend,
      currentServerId,
      onActiveServerRemoved,
      refreshServers,
    ]
  );

  const deleteServer = React.useCallback(
    async (communityId: string) => {
      await controlPlaneBackend.deleteCommunity(communityId);
      if (currentServerId === communityId) {
        onActiveServerRemoved();
        closeMembersModal();
      }
      await refreshServers();
    },
    [
      closeMembersModal,
      controlPlaneBackend,
      currentServerId,
      onActiveServerRemoved,
      refreshServers,
    ]
  );

  const renameServer = React.useCallback(
    async (communityId: string, name: string) => {
      await controlPlaneBackend.renameCommunity({
        communityId,
        name,
      });
      await refreshServers();
      if (currentServerId === communityId && isServerSettingsModalOpen) {
        await loadServerSettings(communityId);
      }
    },
    [
      controlPlaneBackend,
      currentServerId,
      isServerSettingsModalOpen,
      loadServerSettings,
      refreshServers,
    ]
  );

  return {
    state: {
      showMembersModal,
      membersModalCommunityId,
      membersModalServerName,
      membersModalMembers,
      membersModalLoading,
      membersModalError,
      membersModalCanCreateReports,
      membersModalCanManageBans,
      communityBans,
      communityBansLoading,
      communityBansError,
      serverInvites,
      serverInvitesLoading,
      serverInvitesError,
      serverRoles,
      serverMembers,
      serverPermissionCatalog,
      serverRoleManagementLoading,
      serverRoleManagementError,
      serverSettingsInitialValues,
      serverSettingsLoading,
      serverSettingsLoadError,
    },
    derived: {},
    actions: {
      setMembersModalMembers, // temporary compatibility for incremental extraction
      setServerInvitesError, // temporary compatibility for incremental extraction
      setServerRoleManagementError, // temporary compatibility for incremental extraction
      setServerSettingsLoadError, // temporary compatibility for incremental extraction
      resetMembersModal,
      closeMembersModal,
      openServerMembersModal,
      refreshMembersModalMembers,
      refreshMembersModalMembersIfOpen,
      resetCommunityBans,
      clearCommunityBansError,
      loadCommunityBans,
      unbanUserFromCurrentServer,
      resetServerInvites,
      clearServerInvitesError,
      loadServerInvites,
      createServerInvite,
      revokeServerInvite,
      resetServerRoleManagement,
      clearServerRoleManagementError,
      loadServerRoleManagement,
      createServerRole,
      updateServerRole,
      deleteServerRole,
      saveServerRolePermissions,
      saveServerMemberRoles,
      resetServerSettingsState,
      clearServerSettingsLoadError,
      loadServerSettings,
      saveServerSettings,
      leaveServer,
      deleteServer,
      renameServer,
    },
  };
}
