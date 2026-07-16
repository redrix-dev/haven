import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  CommunityBanItem,
  CommunityMemberListItem,
  RedeemedInvite,
  ServerInvite,
  ServerRoleManagementSnapshot,
} from "@shared/lib/backend/types";

/** The control-plane slice this nexus needs (invites live here, not communityData). */
type InviteControlPlane = Pick<
  ControlPlaneBackend,
  | "listActiveCommunityInvites"
  | "createCommunity"
  | "createCommunityInvite"
  | "redeemCommunityInvite"
  | "revokeCommunityInvite"
>;

const NO_MEMBERS: CommunityMemberListItem[] = [];
const NO_BANS: CommunityBanItem[] = [];
const NO_INVITES: ServerInvite[] = [];

export type CommunityAdminSolidState = {
  membersByCommunity: Record<string, CommunityMemberListItem[]>;
  membersLoading: Record<string, boolean>;
  membersError: Record<string, string | null>;
  bansByCommunity: Record<string, CommunityBanItem[]>;
  bansLoading: Record<string, boolean>;
  roleSnapshotByCommunity: Record<string, ServerRoleManagementSnapshot>;
  roleLoadingByCommunity: Record<string, boolean>;
  roleErrorByCommunity: Record<string, string | null>;
  invitesByCommunity: Record<string, ServerInvite[]>;
  invitesLoadingByCommunity: Record<string, boolean>;
  invitesErrorByCommunity: Record<string, string | null>;
};

const initialState = (): CommunityAdminSolidState => ({
  membersByCommunity: {},
  membersLoading: {},
  membersError: {},
  bansByCommunity: {},
  bansLoading: {},
  roleSnapshotByCommunity: {},
  roleLoadingByCommunity: {},
  roleErrorByCommunity: {},
  invitesByCommunity: {},
  invitesLoadingByCommunity: {},
  invitesErrorByCommunity: {},
});

/**
 * Community admin/governance cache. Currently covers the member list (the
 * members panel reads it); roles, invites, bans land here as their screens do
 * — mirroring mobile's CommunityAdminNexus surface as needed.
 */
export class CommunityAdminSolidNexus {
  readonly state: CommunityAdminSolidState;
  private readonly setState: SetStoreFunction<CommunityAdminSolidState>;

  constructor(
    private readonly communityData: CommunityDataBackend,
    private readonly controlPlane: InviteControlPlane,
  ) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  members(communityId: Accessor<string>): Accessor<CommunityMemberListItem[]> {
    return createMemo(
      () => this.state.membersByCommunity[communityId()] ?? NO_MEMBERS,
    );
  }

  membersLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.state.membersLoading[communityId()] ?? false);
  }

  bans(communityId: Accessor<string>): Accessor<CommunityBanItem[]> {
    return createMemo(
      () => this.state.bansByCommunity[communityId()] ?? NO_BANS,
    );
  }

  roleSnapshot(
    communityId: Accessor<string>,
  ): Accessor<ServerRoleManagementSnapshot | null> {
    return createMemo(
      () => this.state.roleSnapshotByCommunity[communityId()] ?? null,
    );
  }

  roleManagementLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.roleLoadingByCommunity[communityId()] ?? false,
    );
  }

  async ensureMembersLoaded(communityId: string): Promise<void> {
    if ((this.state.membersByCommunity[communityId] ?? []).length > 0) return;
    await this.loadMembers(communityId);
  }

  async loadMembers(communityId: string): Promise<void> {
    if (this.state.membersLoading[communityId]) return;
    this.setState("membersLoading", communityId, true);
    this.setState("membersError", communityId, null);
    try {
      const members =
        await this.communityData.listCommunityMembers(communityId);
      this.setState("membersByCommunity", communityId, members);
    } catch (error) {
      this.setState(
        "membersError",
        communityId,
        error instanceof Error ? error.message : "Failed to load members",
      );
    } finally {
      this.setState("membersLoading", communityId, false);
    }
  }

  // ─── moderation actions (parity with mobile CommunityAdminNexus) ───────────

  /** Ban a member: optimistically drop them from the list, then persist. */
  async banMember(input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<void> {
    this.removeMemberLocal(input.communityId, input.targetUserId);
    try {
      // Ban RPC emits member_banned on the target's private_user channel;
      // no client-side broadcast needed.
      await this.communityData.banCommunityMember(input);
    } catch (error) {
      console.warn("[CommunityAdminSolidNexus] banMember failed", error);
      await this.loadMembers(input.communityId);
      throw error;
    }
  }

  /** Kick a member: optimistically drop them from the list, then persist. */
  async kickMember(input: {
    communityId: string;
    targetUserId: string;
  }): Promise<void> {
    this.removeMemberLocal(input.communityId, input.targetUserId);
    try {
      await this.communityData.kickCommunityMember(input);
    } catch (error) {
      console.warn("[CommunityAdminSolidNexus] kickMember failed", error);
      await this.loadMembers(input.communityId);
      throw error;
    }
  }

  async unbanMember(input: {
    communityId: string;
    targetUserId: string;
    reason?: string | null;
  }): Promise<void> {
    await this.communityData.unbanCommunityMember(input);
    await this.loadBans(input.communityId);
  }

  async loadBans(communityId: string): Promise<void> {
    this.setState((s) => ({
      bansLoading: { ...s.bansLoading, [communityId]: true },
    }));
    try {
      const bans = await this.communityData.listCommunityBans(communityId);
      this.setState((s) => ({
        bansByCommunity: { ...s.bansByCommunity, [communityId]: bans },
      }));
    } catch (error) {
      console.warn("[CommunityAdminSolidNexus] loadBans failed", error);
    } finally {
      this.setState((s) => ({
        bansLoading: { ...s.bansLoading, [communityId]: false },
      }));
    }
  }

  private removeMemberLocal(communityId: string, userId: string): void {
    this.setState((s) => ({
      membersByCommunity: {
        ...s.membersByCommunity,
        [communityId]: (s.membersByCommunity[communityId] ?? []).filter(
          (member) => member.userId !== userId,
        ),
      },
    }));
  }

  // ─── role management (parity with mobile loadServerRoleManagement etc.) ────

  async loadRoleManagement(communityId: string): Promise<void> {
    this.setState((s) => ({
      roleLoadingByCommunity: {
        ...s.roleLoadingByCommunity,
        [communityId]: true,
      },
      roleErrorByCommunity: { ...s.roleErrorByCommunity, [communityId]: null },
    }));
    try {
      const snapshot =
        await this.communityData.fetchServerRoleManagement(communityId);
      this.setState((s) => ({
        roleSnapshotByCommunity: {
          ...s.roleSnapshotByCommunity,
          [communityId]: snapshot,
        },
      }));
    } catch (error) {
      this.setState((s) => ({
        roleErrorByCommunity: {
          ...s.roleErrorByCommunity,
          [communityId]:
            error instanceof Error ? error.message : "Failed to load roles",
        },
      }));
    } finally {
      this.setState((s) => ({
        roleLoadingByCommunity: {
          ...s.roleLoadingByCommunity,
          [communityId]: false,
        },
      }));
    }
  }

  async createRole(input: {
    communityId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void> {
    await this.communityData.createServerRole(input);
    await this.loadRoleManagement(input.communityId);
  }

  async deleteRole(input: {
    communityId: string;
    roleId: string;
  }): Promise<void> {
    await this.communityData.deleteServerRole(input);
    await this.loadRoleManagement(input.communityId);
  }

  /** Save a role's details and/or permissions in one shot, then reload once. */
  async saveRole(input: {
    communityId: string;
    roleId: string;
    position: number;
    details: { name: string; color: string } | null;
    permissionKeys: string[] | null;
  }): Promise<void> {
    if (input.details) {
      await this.communityData.updateServerRole({
        communityId: input.communityId,
        roleId: input.roleId,
        name: input.details.name,
        color: input.details.color,
        position: input.position,
      });
    }
    if (input.permissionKeys) {
      await this.communityData.saveServerRolePermissions({
        roleId: input.roleId,
        permissionKeys: input.permissionKeys,
      });
    }
    await this.loadRoleManagement(input.communityId);
  }

  // ─── invites (parity with mobile CommunityAdminNexus; controlPlane-backed) ──

  async createCommunity(name: string): Promise<{ id: string }> {
    return this.controlPlane.createCommunity(name);
  }

  async redeemCommunityInvite(code: string): Promise<RedeemedInvite> {
    return this.controlPlane.redeemCommunityInvite(code);
  }

  invites(communityId: Accessor<string>): Accessor<ServerInvite[]> {
    return createMemo(
      () => this.state.invitesByCommunity[communityId()] ?? NO_INVITES,
    );
  }

  invitesLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.invitesLoadingByCommunity[communityId()] ?? false,
    );
  }

  invitesError(communityId: Accessor<string>): Accessor<string | null> {
    return createMemo(
      () => this.state.invitesErrorByCommunity[communityId()] ?? null,
    );
  }

  async loadInvites(communityId: string): Promise<void> {
    if (this.state.invitesLoadingByCommunity[communityId]) return;
    this.setState("invitesLoadingByCommunity", communityId, true);
    this.setState("invitesErrorByCommunity", communityId, null);
    try {
      const invites =
        await this.controlPlane.listActiveCommunityInvites(communityId);
      this.setState("invitesByCommunity", communityId, invites);
    } catch (error) {
      this.setState(
        "invitesErrorByCommunity",
        communityId,
        error instanceof Error ? error.message : "Failed to load invites",
      );
    } finally {
      this.setState("invitesLoadingByCommunity", communityId, false);
    }
  }

  /** Create an invite, refresh the list, and return it so the UI can show the code. */
  async createInvite(input: {
    communityId: string;
    maxUses: number | null;
    expiresInHours: number | null;
  }): Promise<ServerInvite> {
    const invite = await this.controlPlane.createCommunityInvite(input);
    await this.loadInvites(input.communityId);
    return invite;
  }

  async revokeInvite(input: {
    communityId: string;
    inviteId: string;
  }): Promise<void> {
    await this.controlPlane.revokeCommunityInvite(
      input.communityId,
      input.inviteId,
    );
    await this.loadInvites(input.communityId);
  }

  clear(): void {
    this.setState(initialState());
  }
}

export function createCommunityAdminSolidNexus(
  communityData: CommunityDataBackend,
  controlPlane: InviteControlPlane,
): CommunityAdminSolidNexus {
  return new CommunityAdminSolidNexus(communityData, controlPlane);
}
