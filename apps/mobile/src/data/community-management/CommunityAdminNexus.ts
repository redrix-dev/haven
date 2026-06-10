import { create } from "zustand";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { requireHavenCore } from "@mobile-data/core/havenCoreRegistry";
import { getCommunityDataBackend } from "@shared/lib/backend";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  ChannelAccessRevokedResult,
  ChannelKind,
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelRolePermissionItem,
  CommunityBanItem,
  CommunityMemberListItem,
  PermissionCatalogItem,
  ServerInvite,
  ServerMemberRoleItem,
  ServerRoleItem,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";
import type {
  CommunityAdminChannelPermissionsState,
  CommunityAdminMembersModalState,
  CommunityAdminNexusState,
  CommunityAdminServerPanelState,
} from "@shared/nexus/community/communityAdminTypes";
import { getErrorMessage } from "@platform/lib/errors";
import type { StoreApi, UseBoundStore } from "zustand";

export type {
  CommunityAdminChannelPermissionsState,
  CommunityAdminMembersModalState,
  CommunityAdminNexusState,
  CommunityAdminServerPanelState,
} from "@shared/nexus/community/communityAdminTypes";

const createInitialState = (): CommunityAdminNexusState => ({
  showMembersModal: false,
  membersModalCommunityId: null,
  membersModalServerName: "",
  membersModalMembers: [],
  membersModalLoading: false,
  membersModalError: null,
  membersModalCanCreateReports: false,
  membersModalCanManageMembers: false,
  membersModalCanManageBans: false,
  communityBans: [],
  communityBansLoading: false,
  communityBansError: null,
  serverInvites: [],
  serverInvitesLoading: false,
  serverInvitesError: null,
  serverRoles: [],
  serverMembers: [],
  serverPermissionCatalog: [],
  serverRoleManagementLoading: false,
  serverRoleManagementError: null,
  serverSettingsInitialValues: null,
  serverSettingsLoading: false,
  serverSettingsLoadError: null,
  channelRolePermissions: [],
  channelMemberPermissions: [],
  channelPermissionMemberOptions: [],
  channelPermissionsLoading: false,
  channelPermissionsLoadError: null,
  revision: 0,
});

export class CommunityAdminNexus {
  private readonly store: UseBoundStore<StoreApi<CommunityAdminNexusState>>;
  private readonly controlPlane: ControlPlaneBackend;

  constructor(
    _persistence: NexusPersistence,
    controlPlane: ControlPlaneBackend,
  ) {
    void _persistence;
    this.controlPlane = controlPlane;
    this.store = create<CommunityAdminNexusState>()(() => createInitialState());
  }

  get reactiveStore(): ReadableStore<CommunityAdminNexusState> {
    return this.store;
  }

  getReactiveStore(): UseBoundStore<StoreApi<CommunityAdminNexusState>> {
    return this.store;
  }

  private bump(): void {
    this.store.setState((state) => ({ revision: state.revision + 1 }));
  }

  private patch(partial: Partial<CommunityAdminNexusState>): void {
    this.store.setState(partial);
    this.bump();
  }

  private requireControlPlane(): ControlPlaneBackend {
    if (!this.controlPlane) {
      throw new Error(
        "CommunityAdminNexus called before controlPlane was attached.",
      );
    }
    return this.controlPlane;
  }

  private resolveCommunityId(communityId?: string | null): string | null {
    return communityId ?? requireHavenCore().communities.getActiveId();
  }

  private requireCommunityId(communityId?: string | null): string {
    const id = this.resolveCommunityId(communityId);
    if (!id) throw new Error("No community selected.");
    return id;
  }

  private resolveTargetChannelId(channelId?: string | null): string | null {
    if (channelId) return channelId;
    const ui = requireHavenCore().uiStore.getState();
    if (ui.channelSettingsTargetId) return ui.channelSettingsTargetId;
    return requireHavenCore().channels.getActiveChannelId();
  }

  private canManageInvites(communityId: string): boolean {
    return requireHavenCore().permissions.getPermissions(communityId)
      .canManageInvites;
  }

  private async refreshServers(): Promise<void> {
    const userId = requireHavenCore().authStore.getState().user?.id;
    if (!userId) return;
    await requireHavenCore().refreshCommunities(userId);
  }

  private onActiveServerRemoved(communityId: string): void {
    const core = requireHavenCore();
    if (core.communities.getActiveId() !== communityId) return;

    const ui = requireHavenCore().uiStore.getState();
    ui.setShowServerSettingsModal(false);
    ui.setShowChannelSettingsModal(false);
    ui.setChannelSettingsTargetId(null);
    core.communities.setActiveId(null);
  }

  clear(): void {
    this.store.setState(createInitialState());
  }

  resetMembersModal = (): void => {
    this.patch({
      showMembersModal: false,
      membersModalCommunityId: null,
      membersModalServerName: "",
      membersModalMembers: [],
      membersModalLoading: false,
      membersModalError: null,
      membersModalCanCreateReports: false,
      membersModalCanManageMembers: false,
      membersModalCanManageBans: false,
    });
  };

  closeMembersModal = (): void => {
    this.patch({
      showMembersModal: false,
      membersModalCommunityId: null,
      membersModalMembers: [],
      membersModalError: null,
      membersModalCanCreateReports: false,
      membersModalCanManageMembers: false,
      membersModalCanManageBans: false,
    });
  };

  resetCommunityBans = (): void => {
    this.patch({
      communityBans: [],
      communityBansLoading: false,
      communityBansError: null,
    });
  };

  clearCommunityBansError = (): void => {
    this.patch({ communityBansError: null });
  };

  resetServerInvites = (): void => {
    this.patch({
      serverInvites: [],
      serverInvitesLoading: false,
      serverInvitesError: null,
    });
  };

  clearServerInvitesError = (): void => {
    this.patch({ serverInvitesError: null });
  };

  resetServerRoleManagement = (): void => {
    this.patch({
      serverRoles: [],
      serverMembers: [],
      serverPermissionCatalog: [],
      serverRoleManagementLoading: false,
      serverRoleManagementError: null,
    });
  };

  clearServerRoleManagementError = (): void => {
    this.patch({ serverRoleManagementError: null });
  };

  resetServerSettingsState = (): void => {
    this.patch({
      serverSettingsInitialValues: null,
      serverSettingsLoading: false,
      serverSettingsLoadError: null,
    });
  };

  clearServerSettingsLoadError = (): void => {
    this.patch({ serverSettingsLoadError: null });
  };

  resetChannelPermissionsState = (): void => {
    this.patch({
      channelRolePermissions: [],
      channelMemberPermissions: [],
      channelPermissionMemberOptions: [],
      channelPermissionsLoadError: null,
      channelPermissionsLoading: false,
    });
  };

  refreshMembersModalMembers = async (communityId: string): Promise<void> => {
    const communityBackend = getCommunityDataBackend(communityId);
    const members = await communityBackend.listCommunityMembers(communityId);
    this.patch({ membersModalMembers: members });
  };

  refreshMembersModalMembersIfOpen = async (
    communityId: string,
  ): Promise<void> => {
    const state = this.store.getState();
    if (
      !state.showMembersModal ||
      state.membersModalCommunityId !== communityId
    ) {
      return;
    }
    await this.refreshMembersModalMembers(communityId);
  };

  openServerMembersModal = async (
    communityId: string,
    serverName?: string,
  ): Promise<void> => {
    const resolvedName =
      serverName ??
      requireHavenCore().communities.getCommunity(communityId)?.name ??
      "Community";

    this.patch({
      showMembersModal: true,
      membersModalCommunityId: communityId,
      membersModalServerName: resolvedName,
      membersModalMembers: [],
      membersModalError: null,
      membersModalLoading: true,
      membersModalCanCreateReports: false,
      membersModalCanManageMembers: false,
      membersModalCanManageBans: false,
    });

    try {
      const communityBackend = getCommunityDataBackend(communityId);
      const [members, permissions] = await Promise.all([
        communityBackend.listCommunityMembers(communityId),
        communityBackend.getMyPermissions(communityId),
      ]);
      this.patch({
        membersModalMembers: members,
        membersModalCanCreateReports: Boolean(permissions.canCreateReports),
        membersModalCanManageMembers: Boolean(permissions.canManageMembers),
        membersModalCanManageBans: Boolean(permissions.canManageBans),
      });
    } catch (error: unknown) {
      this.patch({
        membersModalError: getErrorMessage(
          error,
          "Failed to load community members.",
        ),
      });
    } finally {
      this.patch({ membersModalLoading: false });
    }
  };

  loadCommunityBans = async (communityId?: string | null): Promise<void> => {
    const resolvedId = this.resolveCommunityId(communityId);
    if (!resolvedId) {
      this.patch({ communityBans: [], communityBansError: null });
      return;
    }

    this.patch({ communityBansLoading: true, communityBansError: null });
    try {
      const communityBackend = getCommunityDataBackend(resolvedId);
      const bans = await communityBackend.listCommunityBans(resolvedId);
      this.patch({ communityBans: bans });
    } catch (error: unknown) {
      this.patch({
        communityBans: [],
        communityBansError: getErrorMessage(error, "Failed to load bans."),
      });
      throw error;
    } finally {
      this.patch({ communityBansLoading: false });
    }
  };

  loadServerInvites = async (communityId?: string | null): Promise<void> => {
    const resolvedId = this.resolveCommunityId(communityId);
    if (!resolvedId) {
      this.patch({ serverInvites: [], serverInvitesError: null });
      return;
    }

    this.patch({ serverInvitesLoading: true, serverInvitesError: null });
    try {
      const invites =
        await this.requireControlPlane().listActiveCommunityInvites(resolvedId);
      this.patch({
        serverInvites: invites.map((invite) => ({
          id: invite.id,
          code: invite.code,
          currentUses: invite.currentUses,
          maxUses: invite.maxUses,
          expiresAt: invite.expiresAt,
          isActive: invite.isActive,
        })),
      });
    } catch (error: unknown) {
      this.patch({
        serverInvites: [],
        serverInvitesError: getErrorMessage(error, "Failed to load invites."),
      });
      throw error;
    } finally {
      this.patch({ serverInvitesLoading: false });
    }
  };

  loadServerRoleManagement = async (
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.resolveCommunityId(communityId);
    if (!resolvedId) {
      this.patch({
        serverRoles: [],
        serverMembers: [],
        serverPermissionCatalog: [],
      });
      return;
    }

    this.patch({
      serverRoleManagementLoading: true,
      serverRoleManagementError: null,
    });

    try {
      const communityBackend = getCommunityDataBackend(resolvedId);
      const snapshot =
        await communityBackend.fetchServerRoleManagement(resolvedId);
      this.patch({
        serverRoles: snapshot.roles,
        serverMembers: snapshot.members,
        serverPermissionCatalog: snapshot.permissionsCatalog,
      });
    } catch (error: unknown) {
      this.patch({
        serverRoles: [],
        serverMembers: [],
        serverPermissionCatalog: [],
        serverRoleManagementError: getErrorMessage(
          error,
          "Failed to load community roles and members.",
        ),
      });
      throw error;
    } finally {
      this.patch({ serverRoleManagementLoading: false });
    }
  };

  loadServerSettings = async (communityId?: string | null): Promise<void> => {
    const resolvedId = this.resolveCommunityId(communityId);
    if (!resolvedId) {
      this.patch({ serverSettingsInitialValues: null });
      return;
    }

    this.patch({ serverSettingsLoadError: null, serverSettingsLoading: true });

    try {
      const communityBackend = getCommunityDataBackend(resolvedId);
      const snapshot = await communityBackend.fetchServerSettings(resolvedId);
      this.patch({
        serverSettingsInitialValues: {
          name: snapshot.name,
          description: snapshot.description,
          allowPublicInvites: snapshot.allowPublicInvites,
          requireReportReason: snapshot.requireReportReason,
        },
      });
    } catch (error: unknown) {
      this.patch({
        serverSettingsInitialValues: null,
        serverSettingsLoadError: getErrorMessage(
          error,
          "Failed to load community settings.",
        ),
      });
      throw error;
    } finally {
      this.patch({ serverSettingsLoading: false });
    }
  };

  createServerInvite = async (
    values: {
      maxUses: number | null;
      expiresInHours: number | null;
    },
    communityIdOverride?: string | null,
  ): Promise<ServerInvite> => {
    const communityId = this.requireCommunityId(communityIdOverride);

    const invite = await this.requireControlPlane().createCommunityInvite({
      communityId,
      maxUses: values.maxUses,
      expiresInHours: values.expiresInHours,
    });

    await this.loadServerInvites(communityId);

    return {
      id: invite.id,
      code: invite.code,
      currentUses: invite.currentUses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
      isActive: invite.isActive,
    };
  };

  saveServerSettings = async (
    values: ServerSettingsUpdate,
    communityIdOverride?: string | null,
  ): Promise<void> => {
    const communityId = this.requireCommunityId(communityIdOverride);
    const userId = requireHavenCore().authStore.getState().user?.id;
    if (!userId) throw new Error("Not authenticated");

    const trimmedName = values.name.trim();
    if (!trimmedName) {
      throw new Error("Community name is required.");
    }

    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.updateServerSettings({
      communityId,
      values: {
        name: trimmedName,
        description: values.description,
        allowPublicInvites: values.allowPublicInvites,
        requireReportReason: values.requireReportReason,
      },
    });

    await this.refreshServers();
    await this.loadServerSettings(communityId);
  };

  openServerSettingsModal = async (
    communityIdOverride?: string,
  ): Promise<void> => {
    const currentServerId = requireHavenCore().communities.getActiveId();
    const targetCommunityId =
      communityIdOverride ?? currentServerId ?? undefined;
    if (!targetCommunityId) return;

    if (targetCommunityId !== currentServerId) {
      requireHavenCore().communities.setActiveId(targetCommunityId);
      return;
    }

    const ui = requireHavenCore().uiStore.getState();
    ui.setShowServerSettingsModal(true);
    this.resetServerSettingsState();
    this.clearServerInvitesError();
    this.clearServerRoleManagementError();
    this.clearCommunityBansError();

    try {
      await this.loadServerSettings(targetCommunityId);
    } catch (error: unknown) {
      console.error("Failed to load community settings:", error);
      this.patch({
        serverSettingsLoadError: getErrorMessage(
          error,
          "Failed to load community settings.",
        ),
      });
    }

    if (this.canManageInvites(targetCommunityId)) {
      try {
        await this.loadServerInvites(targetCommunityId);
      } catch (error: unknown) {
        console.error("Failed to load community invites:", error);
        this.patch({
          serverInvitesError: getErrorMessage(
            error,
            "Failed to load community invites.",
          ),
        });
      }
    } else {
      this.resetServerInvites();
    }

    try {
      await this.loadServerRoleManagement(targetCommunityId);
    } catch (error: unknown) {
      console.error("Failed to load community role management:", error);
      this.patch({
        serverRoleManagementError: getErrorMessage(
          error,
          "Failed to load community roles and members.",
        ),
      });
    }

    try {
      await this.loadCommunityBans(targetCommunityId);
    } catch (error: unknown) {
      console.error("Failed to load community bans:", error);
    }
  };

  revokeServerInvite = async (
    inviteId: string,
    communityIdOverride?: string | null,
  ): Promise<void> => {
    const communityId = this.requireCommunityId(communityIdOverride);
    await this.requireControlPlane().revokeCommunityInvite(
      communityId,
      inviteId,
    );
    await this.loadServerInvites(communityId);
  };

  unbanUserFromCurrentServer = async (
    input: {
      targetUserId: string;
      reason?: string | null;
    },
    communityIdOverride?: string | null,
  ): Promise<void> => {
    const communityId = this.requireCommunityId(communityIdOverride);
    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.unbanCommunityMember({
      communityId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    });

    await this.loadCommunityBans(communityId);
    await this.refreshMembersModalMembersIfOpen(communityId);
  };

  createServerRole = async (input: {
    name: string;
    color: string;
    position: number;
  }): Promise<void> => {
    const communityId = this.requireCommunityId();
    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.createServerRole({
      communityId,
      name: input.name,
      color: input.color,
      position: input.position,
    });

    await this.loadServerRoleManagement(communityId);
  };

  updateServerRole = async (input: {
    roleId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void> => {
    const communityId = this.requireCommunityId();
    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.updateServerRole({
      communityId,
      roleId: input.roleId,
      name: input.name,
      color: input.color,
      position: input.position,
    });

    await this.loadServerRoleManagement(communityId);
  };

  reorderServerRoles = async (
    orderedRoles: ServerRoleItem[],
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const communityBackend = getCommunityDataBackend(resolvedId);
    const n = orderedRoles.length;

    for (let i = 0; i < n; i++) {
      const role = orderedRoles[i];
      const newPosition = n - 1 - i;
      if (role.position === newPosition) continue;
      await communityBackend.updateServerRole({
        communityId: resolvedId,
        roleId: role.id,
        name: role.name,
        color: role.color,
        position: newPosition,
      });
    }

    await this.loadServerRoleManagement(resolvedId);
  };

  deleteServerRole = async (roleId: string): Promise<void> => {
    const communityId = this.requireCommunityId();
    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.deleteServerRole({
      communityId,
      roleId,
    });

    await this.loadServerRoleManagement(communityId);
  };

  saveServerRolePermissions = async (
    roleId: string,
    permissionKeys: string[],
  ): Promise<void> => {
    const communityId = this.requireCommunityId();
    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.saveServerRolePermissions({
      roleId,
      permissionKeys,
    });

    await this.loadServerRoleManagement(communityId);
  };

  saveServerMemberRoles = async (
    memberId: string,
    roleIds: string[],
  ): Promise<void> => {
    const communityId = this.requireCommunityId();
    const userId = requireHavenCore().authStore.getState().user?.id;
    if (!userId) throw new Error("Not authenticated");

    const communityBackend = getCommunityDataBackend(communityId);
    await communityBackend.saveServerMemberRoles({
      communityId,
      memberId,
      roleIds,
      assignedByUserId: userId,
    });

    await this.loadServerRoleManagement(communityId);
  };

  banMember = async (input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<void> => {
    const communityBackend = getCommunityDataBackend(input.communityId);
    const banResult = await communityBackend.banCommunityMember({
      communityId: input.communityId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    });
    try {
      await communityBackend.broadcastMemberBanned(banResult);
    } catch (err) {
      console.error("[CommunityAdminNexus] broadcastMemberBanned failed", err);
    }
    await this.refreshMembersModalMembersIfOpen(input.communityId);
  };

  kickMember = async (input: {
    communityId: string;
    targetUserId: string;
  }): Promise<void> => {
    const communityBackend = getCommunityDataBackend(input.communityId);
    await communityBackend.kickCommunityMember({
      communityId: input.communityId,
      targetUserId: input.targetUserId,
    });
    await this.refreshMembersModalMembersIfOpen(input.communityId);
  };

  reportMember = async (input: {
    communityId: string;
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void> => {
    const communityBackend = getCommunityDataBackend(input.communityId);
    await communityBackend.reportUserProfile({
      communityId: input.communityId,
      targetUserId: input.targetUserId,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
    });
  };

  leaveServer = async (communityId: string): Promise<void> => {
    await this.requireControlPlane().leaveCommunity(communityId);
    const currentServerId = requireHavenCore().communities.getActiveId();
    if (currentServerId === communityId) {
      this.onActiveServerRemoved(communityId);
      this.closeMembersModal();
    }
    await this.refreshServers();
  };

  deleteServer = async (communityId: string): Promise<void> => {
    await this.requireControlPlane().deleteCommunity(communityId);
    const currentServerId = requireHavenCore().communities.getActiveId();
    if (currentServerId === communityId) {
      this.onActiveServerRemoved(communityId);
      this.closeMembersModal();
    }
    await this.refreshServers();
  };

  renameServer = async (communityId: string, name: string): Promise<void> => {
    await this.requireControlPlane().renameCommunity({
      communityId,
      name,
    });
    await this.refreshServers();

    const currentServerId = requireHavenCore().communities.getActiveId();
    const { showServerSettingsModal } = requireHavenCore().uiStore.getState();
    if (currentServerId === communityId && showServerSettingsModal) {
      await this.loadServerSettings(communityId);
    }
  };

  createChannel = async (
    values: {
      name: string;
      topic: string | null;
      kind: ChannelKind;
    },
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const userId = requireHavenCore().authStore.getState().user?.id;
    if (!userId) throw new Error("Not authenticated");

    const core = requireHavenCore();
    const channels = core.channels.getChannelsSnapshot(resolvedId);
    const nextPosition =
      channels.length === 0
        ? 0
        : Math.max(...channels.map((channel) => channel.position)) + 1;

    const communityBackend = getCommunityDataBackend(resolvedId);
    const channel = await communityBackend.createChannel({
      communityId: resolvedId,
      name: values.name,
      topic: values.topic,
      position: nextPosition,
      kind: values.kind,
    });

    core.channels.upsertChannel(channel);
    core.channels.setActiveChannelId(channel.id);
  };

  saveChannelSettings = async (
    values: { name: string; topic: string | null },
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const channelIdToUpdate = this.resolveTargetChannelId(channelId);
    if (!channelIdToUpdate) throw new Error("No channel selected.");

    const communityBackend = getCommunityDataBackend(resolvedId);
    await communityBackend.updateChannel({
      communityId: resolvedId,
      channelId: channelIdToUpdate,
      name: values.name,
      topic: values.topic,
    });

    requireHavenCore().channels.updateChannel(channelIdToUpdate, {
      name: values.name,
      topic: values.topic,
    });
  };

  renameChannel = async (
    channelId: string,
    name: string,
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const channelRow = requireHavenCore().channels.getChannel(channelId);
    if (!channelRow) throw new Error("Channel not found.");

    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("Channel name is required.");
    }

    const communityBackend = getCommunityDataBackend(resolvedId);
    await communityBackend.updateChannel({
      communityId: resolvedId,
      channelId,
      name: normalizedName,
      topic: channelRow.topic,
    });

    requireHavenCore().channels.updateChannel(channelId, {
      name: normalizedName,
    });
  };

  deleteChannel = async (
    channelId: string,
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const core = requireHavenCore();
    const channels = core.channels.getChannelsSnapshot(resolvedId);
    if (channels.length <= 1) {
      throw new Error("At least one channel must exist in a server.");
    }

    const communityBackend = getCommunityDataBackend(resolvedId);
    await communityBackend.deleteChannel({
      communityId: resolvedId,
      channelId,
    });

    core.channels.removeChannel(channelId, resolvedId);
    if (core.channels.getActiveChannelId() === channelId) {
      const remaining = core.channels
        .getChannelsSnapshot(resolvedId)
        .map((ch) => ch.id);
      core.channels.setActiveChannelId(
        remaining.length > 0 ? remaining[0] : null,
      );
    }

    const ui = requireHavenCore().uiStore.getState();
    ui.setChannelSettingsTargetId(
      ui.channelSettingsTargetId === channelId
        ? null
        : ui.channelSettingsTargetId,
    );
  };

  deleteCurrentChannel = async (): Promise<void> => {
    const targetChannelId = this.resolveTargetChannelId();
    if (!targetChannelId) throw new Error("No channel selected.");
    await this.deleteChannel(targetChannelId);
    requireHavenCore().uiStore.getState().setShowChannelSettingsModal(false);
  };

  loadChannelPermissions = async (
    targetChannelId?: string | null,
    communityId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.resolveCommunityId(communityId);
    const resolvedChannelId = this.resolveTargetChannelId(targetChannelId);
    const userId = requireHavenCore().authStore.getState().user?.id;

    if (!resolvedId || !resolvedChannelId || !userId) {
      this.patch({
        channelRolePermissions: [],
        channelMemberPermissions: [],
        channelPermissionMemberOptions: [],
      });
      return;
    }

    this.patch({
      channelPermissionsLoadError: null,
      channelPermissionsLoading: true,
    });
    try {
      const communityBackend = getCommunityDataBackend(resolvedId);
      const snapshot = await communityBackend.fetchChannelPermissions({
        communityId: resolvedId,
        channelId: resolvedChannelId,
        userId,
      });

      this.patch({
        channelRolePermissions: snapshot.rolePermissions,
        channelMemberPermissions: snapshot.memberPermissions,
        channelPermissionMemberOptions: snapshot.memberOptions,
      });
    } catch (error: unknown) {
      this.patch({
        channelRolePermissions: [],
        channelMemberPermissions: [],
        channelPermissionMemberOptions: [],
        channelPermissionsLoadError: getErrorMessage(
          error,
          "Failed to load channel permissions.",
        ),
      });
      throw error;
    } finally {
      this.patch({ channelPermissionsLoading: false });
    }
  };

  openChannelSettingsModal = async (channelId?: string): Promise<void> => {
    const targetChannelId = this.resolveTargetChannelId(channelId);
    if (!targetChannelId) return;

    const ui = requireHavenCore().uiStore.getState();
    ui.setChannelSettingsTargetId(targetChannelId);
    ui.setShowChannelSettingsModal(true);
    this.patch({ channelPermissionsLoadError: null });

    try {
      await this.loadChannelPermissions(targetChannelId);
    } catch (error: unknown) {
      console.error("Failed to load channel permissions:", error);
      this.patch({
        channelPermissionsLoadError: getErrorMessage(
          error,
          "Failed to load channel permissions.",
        ),
      });
    }
  };

  saveRoleChannelPermissions = async (
    roleId: string,
    permissions: ChannelPermissionState,
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<void> => {
    const resolvedId = this.requireCommunityId(communityId);
    const targetChannelId = this.resolveTargetChannelId(channelId);
    if (!targetChannelId) throw new Error("No channel selected.");

    const roleRow = this.store
      .getState()
      .channelRolePermissions.find((row) => row.roleId === roleId);
    if (roleRow && !roleRow.editable) {
      throw new Error(
        "You can only edit overwrites for roles below your highest role.",
      );
    }

    const communityBackend = getCommunityDataBackend(resolvedId);
    await communityBackend.saveRoleChannelPermissions({
      communityId: resolvedId,
      channelId: targetChannelId,
      roleId,
      permissions,
    });

    this.store.setState((state) => ({
      ...state,
      channelRolePermissions: state.channelRolePermissions.map((row) =>
        row.roleId === roleId
          ? {
              ...row,
              canView: permissions.canView,
              canSend: permissions.canSend,
              canManage: permissions.canManage,
            }
          : row,
      ),
      revision: state.revision + 1,
    }));
  };

  saveMemberChannelPermissions = async (
    memberId: string,
    permissions: ChannelPermissionState,
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<ChannelAccessRevokedResult | null> => {
    const resolvedId = this.requireCommunityId(communityId);
    const targetChannelId = this.resolveTargetChannelId(channelId);
    if (!targetChannelId) throw new Error("No channel selected.");

    const communityBackend = getCommunityDataBackend(resolvedId);
    const accessRevokedResult =
      await communityBackend.saveMemberChannelPermissions({
        communityId: resolvedId,
        channelId: targetChannelId,
        memberId,
        permissions,
      });

    this.store.setState((state) => ({
      ...state,
      channelMemberPermissions: state.channelMemberPermissions.map((row) =>
        row.memberId === memberId
          ? {
              ...row,
              canView: permissions.canView,
              canSend: permissions.canSend,
              canManage: permissions.canManage,
            }
          : row,
      ),
      revision: state.revision + 1,
    }));

    return accessRevokedResult;
  };
}
