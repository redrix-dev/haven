import type {
  CommunityMemberBackend,
  CommunitySettingsBackend,
} from "@shared/lib/backend/communityDataBackend.interface";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  CommunityBanItem,
  CommunityMemberListItem,
  RedeemedInvite,
  ServerInvite,
  ServerRoleItem,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";
import { messageFromError } from "../kit/errors";
import { createLoadGate } from "../kit/loadGate";
import { omitKey } from "../kit/records";
import type { StatePort } from "../kit/statePort";
import type { AdminResource, CommunityAdminState } from "./communityAdminTypes";

/** The community data calls administration makes: members and bans, settings and roles. */
export type CommunityAdminBackend = CommunityMemberBackend &
  CommunitySettingsBackend;

/** The control-plane calls community administration makes. */
export type AdminControlPlane = Pick<
  ControlPlaneBackend,
  | "listActiveCommunityInvites"
  | "createCommunity"
  | "createCommunityInvite"
  | "deleteCommunity"
  | "leaveCommunity"
  | "renameCommunity"
  | "redeemCommunityInvite"
  | "revokeCommunityInvite"
>;

const RESOURCES: AdminResource[] = [
  "members",
  "bans",
  "roles",
  "settings",
  "invites",
];

const byResource = <V>(): Record<AdminResource, Record<string, V>> => ({
  members: {},
  bans: {},
  roles: {},
  settings: {},
  invites: {},
});

export const createInitialCommunityAdminState = (): CommunityAdminState => ({
  membersByCommunity: {},
  bansByCommunity: {},
  rolesByCommunity: {},
  settingsByCommunity: {},
  invitesByCommunity: {},
  loading: byResource<boolean>(),
  errors: byResource<string | null>(),
});

/** Which state slot holds each resource's data. */
const DATA_KEY = {
  members: "membersByCommunity",
  bans: "bansByCommunity",
  roles: "rolesByCommunity",
  settings: "settingsByCommunity",
  invites: "invitesByCommunity",
} as const satisfies Record<AdminResource, keyof CommunityAdminState>;

const FALLBACK_ERROR: Record<AdminResource, string> = {
  members: "Failed to load members.",
  bans: "Failed to load bans.",
  roles: "Failed to load community roles and members.",
  settings: "Failed to load community settings.",
  invites: "Failed to load invites.",
};

/**
 * Community administration: members, bans, roles, settings and invites for
 * each community, plus the commands that change them.
 *
 * Loads never reject. A failed load records its message in `errors` for the
 * screen to show, so callers can fire loads without catching.
 */
export class CommunityAdminNexus {
  private readonly loads = createLoadGate();

  constructor(
    protected readonly port: StatePort<CommunityAdminState>,
    private readonly communityData: CommunityAdminBackend,
    private readonly controlPlane: AdminControlPlane,
  ) {}

  // ─── reads ─────────────────────────────────────────────────────────────────

  isLoading(resource: AdminResource, communityId: string): boolean {
    return this.port.get().loading[resource][communityId] ?? false;
  }

  getError(resource: AdminResource, communityId: string): string | null {
    return this.port.get().errors[resource][communityId] ?? null;
  }

  // ─── members ───────────────────────────────────────────────────────────────

  loadMembers(communityId: string): Promise<void> {
    return this.load("members", communityId, () =>
      this.communityData.listCommunityMembers(communityId),
    );
  }

  /** Load the member list unless one is already cached. */
  async ensureMembersLoaded(communityId: string): Promise<void> {
    if ((this.port.get().membersByCommunity[communityId] ?? []).length > 0) {
      return;
    }
    await this.loadMembers(communityId);
  }

  /** Ban a member: drop them from the list at once, then persist (reload if it fails). */
  async banMember(input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<void> {
    this.removeMemberLocal(input.communityId, input.targetUserId);
    try {
      // The ban RPC tells the target on their private channel; no broadcast here.
      await this.communityData.banCommunityMember(input);
    } catch (error) {
      await this.loadMembers(input.communityId);
      throw error;
    }
  }

  /** Kick a member: drop them from the list at once, then persist (reload if it fails). */
  async kickMember(input: {
    communityId: string;
    targetUserId: string;
  }): Promise<void> {
    this.removeMemberLocal(input.communityId, input.targetUserId);
    try {
      await this.communityData.kickCommunityMember(input);
    } catch (error) {
      await this.loadMembers(input.communityId);
      throw error;
    }
  }

  // ─── bans ──────────────────────────────────────────────────────────────────

  loadBans(communityId: string): Promise<void> {
    return this.load("bans", communityId, () =>
      this.communityData.listCommunityBans(communityId),
    );
  }

  async unbanMember(input: {
    communityId: string;
    targetUserId: string;
    reason?: string | null;
  }): Promise<void> {
    await this.communityData.unbanCommunityMember(input);
    await this.loadBans(input.communityId);
  }

  // ─── roles ─────────────────────────────────────────────────────────────────

  loadRoleManagement(communityId: string): Promise<void> {
    return this.load("roles", communityId, () =>
      this.communityData.fetchServerRoleManagement(communityId),
    );
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

  /** Save a role's details and/or permissions, then reload once. */
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

  /** Persist a new role order, highest first; only roles whose position changed are written. */
  async reorderRoles(input: {
    communityId: string;
    orderedRoles: ServerRoleItem[];
  }): Promise<void> {
    const count = input.orderedRoles.length;
    for (const [index, role] of input.orderedRoles.entries()) {
      const position = count - 1 - index;
      if (role.position === position) continue;
      await this.communityData.updateServerRole({
        communityId: input.communityId,
        roleId: role.id,
        name: role.name,
        color: role.color,
        position,
      });
    }
    await this.loadRoleManagement(input.communityId);
  }

  /** Replace a member's roles with exactly `roleIds` (system roles included). */
  async saveMemberRoles(input: {
    communityId: string;
    memberId: string;
    roleIds: string[];
    assignedByUserId: string;
  }): Promise<void> {
    await this.communityData.saveServerMemberRoles(input);
    await this.loadRoleManagement(input.communityId);
  }

  // ─── settings + community lifecycle ────────────────────────────────────────

  loadServerSettings(communityId: string): Promise<void> {
    return this.load("settings", communityId, () =>
      this.communityData.fetchServerSettings(communityId),
    );
  }

  async saveServerSettings(input: {
    communityId: string;
    values: ServerSettingsUpdate;
  }): Promise<void> {
    const name = input.values.name.trim();
    if (!name) throw new Error("Community name is required.");
    await this.communityData.updateServerSettings({
      communityId: input.communityId,
      values: { ...input.values, name },
    });
    await this.loadServerSettings(input.communityId);
  }

  createCommunity(name: string): Promise<{ id: string }> {
    return this.controlPlane.createCommunity(name);
  }

  leaveCommunity(communityId: string): Promise<void> {
    return this.controlPlane.leaveCommunity(communityId);
  }

  deleteCommunity(communityId: string): Promise<void> {
    return this.controlPlane.deleteCommunity(communityId);
  }

  async renameCommunity(communityId: string, name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Community name is required.");
    await this.controlPlane.renameCommunity({ communityId, name: trimmedName });
  }

  // ─── invites ───────────────────────────────────────────────────────────────

  loadInvites(communityId: string): Promise<void> {
    return this.load("invites", communityId, () =>
      this.controlPlane.listActiveCommunityInvites(communityId),
    );
  }

  /** Create an invite, refresh the list, and return it so the screen can show the code. */
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

  redeemCommunityInvite(code: string): Promise<RedeemedInvite> {
    return this.controlPlane.redeemCommunityInvite(code);
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  /** Forget everything cached for one community (left, deleted, or banned from it). */
  clearCommunity(communityId: string): void {
    const state = this.port.get();
    const loading = byResource<boolean>();
    const errors = byResource<string | null>();
    for (const resource of RESOURCES) {
      // A load answering after this would put the community's data back.
      this.loads.forget(`${resource}:${communityId}`);
      loading[resource] = omitKey(state.loading[resource], communityId);
      errors[resource] = omitKey(state.errors[resource], communityId);
    }
    this.port.set({
      membersByCommunity: omitKey(state.membersByCommunity, communityId),
      bansByCommunity: omitKey(state.bansByCommunity, communityId),
      rolesByCommunity: omitKey(state.rolesByCommunity, communityId),
      settingsByCommunity: omitKey(state.settingsByCommunity, communityId),
      invitesByCommunity: omitKey(state.invitesByCommunity, communityId),
      loading,
      errors,
    });
  }

  clear(): void {
    this.loads.clear();
    this.port.set(createInitialCommunityAdminState());
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  /**
   * One load per resource and community at a time. Records loading and the
   * error in state; on failure the previous data stays and the promise resolves.
   */
  private load(
    resource: AdminResource,
    communityId: string,
    fetch: () => Promise<
      | CommunityMemberListItem[]
      | CommunityBanItem[]
      | ServerRoleManagementSnapshot
      | ServerSettingsSnapshot
      | ServerInvite[]
    >,
  ): Promise<void> {
    return this.loads.run(`${resource}:${communityId}`, async (stale) => {
      this.setStatus(resource, communityId, true, null);
      try {
        const data = await fetch();
        if (stale()) return;
        const key = DATA_KEY[resource];
        this.port.set({
          [key]: { ...this.port.get()[key], [communityId]: data },
        } as Partial<CommunityAdminState>);
        this.setStatus(resource, communityId, false, null);
      } catch (error) {
        if (stale()) return;
        this.setStatus(
          resource,
          communityId,
          false,
          messageFromError(error, FALLBACK_ERROR[resource]),
        );
      }
    });
  }

  private setStatus(
    resource: AdminResource,
    communityId: string,
    loading: boolean,
    error: string | null,
  ): void {
    const state = this.port.get();
    this.port.set({
      loading: {
        ...state.loading,
        [resource]: { ...state.loading[resource], [communityId]: loading },
      },
      errors: {
        ...state.errors,
        [resource]: { ...state.errors[resource], [communityId]: error },
      },
    });
  }

  private removeMemberLocal(communityId: string, userId: string): void {
    const members = this.port.get().membersByCommunity;
    this.port.set({
      membersByCommunity: {
        ...members,
        [communityId]: (members[communityId] ?? []).filter(
          (member) => member.userId !== userId,
        ),
      },
    });
  }
}
