/**
 * Communities: the ones the person belongs to, what they may do in each, and
 * (for people who manage them) each community's invites.
 * DATABASE.md: "Communities".
 *
 * One call loads what a member needs to show a community: its members,
 * roles and categories (`loadCommunity` in the backend). Those rows belong to
 * other collections, so this hands each of them its part, and tells them
 * when a community is gone. Channels load on their own (`channels`), because
 * which ones the person sees depends on their roles, not on the community.
 */

import type {
  CommunitiesBackend,
  CommunityChanges,
  CommunityStructure,
} from "@shared/lib/backend/communities";
import type {
  Community,
  Invite,
  Permission,
} from "@shared/lib/backend/records";
import type { DeviceCopy } from "../kit/deviceCopies";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

export type CommunitiesState = {
  byId: ById<Community>;
  /** What the person may do, by community id. The owner has every permission. */
  permissions: Readonly<Record<string, readonly Permission[]>>;
  /** By community id, then invite id. Loaded only for people who manage invites. */
  invites: Readonly<Record<string, ById<Invite>>>;
  requests: RequestMap;
};

export const createCommunitiesState = (): CommunitiesState => ({
  byId: {},
  permissions: {},
  invites: {},
  requests: {},
});

/**
 * Kept on the device: the community list, so it is there at launch. Not
 * permissions: they decide what the app offers, so they come fresh.
 */
export const communitiesCopy: DeviceCopy<CommunitiesState, Community[]> = {
  name: "communities",
  version: 1,
  pick: (state) => Object.values(state.byId),
  restore: (saved) => ({ byId: putRows({}, saved) }),
};

/** A collection that holds part of each community (members, roles, categories). */
export type CommunityPart = {
  /** This community's rows, as just loaded: they replace what was held for it. */
  takeStructure(structure: CommunityStructure): void;
  /** The community is gone, or the person is no longer in it. */
  dropCommunity(communityId: string): void;
};

export type CommunitiesBackendPart = Pick<
  CommunitiesBackend,
  | "listMyCommunities"
  | "loadCommunity"
  | "getMyPermissions"
  | "createCommunity"
  | "updateCommunity"
  | "deleteCommunity"
  | "transferOwnership"
  | "joinCommunity"
  | "leaveCommunity"
  | "listInvites"
  | "createInvite"
  | "revokeInvite"
>;

export class Communities {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<CommunitiesState>,
    private readonly backend: CommunitiesBackendPart,
    private readonly parts: readonly CommunityPart[],
  ) {
    this.requests = new Requests("communities", port);
  }

  get(communityId: string): Community | undefined {
    return this.port.get().byId[communityId];
  }

  can(communityId: string, permission: Permission): boolean {
    return (
      this.port.get().permissions[communityId]?.includes(permission) ?? false
    );
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /** The communities the person belongs to, replacing the list held. */
  loadMine(): Promise<void> {
    return this.requests.refresh("mine", async (stale) => {
      const communities = await this.backend.listMyCommunities();
      if (stale()) return;
      const kept = new Set(communities.map((community) => community.id));
      const lost = Object.keys(this.port.get().byId).filter(
        (id) => !kept.has(id),
      );
      this.port.set({ byId: putRows({}, communities) });
      // Left or removed while away: nothing of those may stay.
      for (const communityId of lost) this.forget(communityId);
    });
  }

  /**
   * One community's members, roles, categories and the person's permissions
   * there. Also the answer to `access.changed`.
   */
  loadCommunity(communityId: string): Promise<void> {
    return this.requests.refresh(`community:${communityId}`, async (stale) => {
      const [structure, permissions] = await Promise.all([
        this.backend.loadCommunity(communityId),
        this.backend.getMyPermissions(communityId),
      ]);
      if (stale()) return;
      this.port.set({
        byId: putRows(this.port.get().byId, [structure.community]),
        permissions: {
          ...this.port.get().permissions,
          [communityId]: permissions,
        },
      });
      for (const part of this.parts) part.takeStructure(structure);
    });
  }

  /** Needs `manage_invites`; without it the list is simply empty. */
  loadInvites(communityId: string): Promise<void> {
    return this.requests.run(`invites:${communityId}`, async (stale) => {
      const invites = await this.backend.listInvites(communityId);
      if (stale()) return;
      this.setInvites(communityId, putRows({}, invites));
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  async create(name: string, description?: string): Promise<Community> {
    const community = await this.backend.createCommunity(name, description);
    this.applyCommunity(community);
    await this.loadCommunity(community.id);
    return community;
  }

  async join(code: string): Promise<Community> {
    const community = await this.backend.joinCommunity(code);
    this.applyCommunity(community);
    await this.loadCommunity(community.id);
    return community;
  }

  async update(communityId: string, changes: CommunityChanges): Promise<void> {
    this.applyCommunity(
      await this.backend.updateCommunity(communityId, changes),
    );
  }

  /** What the old and new owner may do changes; `access.changed` follows. */
  async transferOwnership(communityId: string, userId: string): Promise<void> {
    this.applyCommunity(
      await this.backend.transferOwnership(communityId, userId),
    );
  }

  async leave(communityId: string): Promise<void> {
    await this.backend.leaveCommunity(communityId);
    this.applyGone(communityId);
  }

  async remove(communityId: string): Promise<void> {
    await this.backend.deleteCommunity(communityId);
    this.applyGone(communityId);
  }

  async createInvite(
    communityId: string,
    options?: Parameters<CommunitiesBackendPart["createInvite"]>[1],
  ): Promise<Invite> {
    const invite = await this.backend.createInvite(communityId, options);
    this.setInvites(
      communityId,
      putRows(this.port.get().invites[communityId] ?? {}, [invite]),
    );
    return invite;
  }

  async revokeInvite(communityId: string, inviteId: string): Promise<void> {
    await this.backend.revokeInvite(inviteId);
    const invites = this.port.get().invites[communityId];
    if (invites) this.setInvites(communityId, dropIds(invites, [inviteId]));
  }

  // ── Events ────────────────────────────────────────────────────────────────

  applyCommunity(community: Community): void {
    this.port.set({ byId: putRows(this.port.get().byId, [community]) });
  }

  /**
   * Deleted, or the person left or was removed. Everything held about it
   * goes, here and in its parts, and a load still running writes nothing.
   */
  applyGone(communityId: string): void {
    this.forget(communityId);
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createCommunitiesState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private setInvites(communityId: string, invites: ById<Invite>): void {
    this.port.set({
      invites: { ...this.port.get().invites, [communityId]: invites },
    });
  }

  private forget(communityId: string): void {
    this.requests.forget(`community:${communityId}`);
    this.requests.forget(`invites:${communityId}`);
    const state = this.port.get();
    const { [communityId]: _permissions, ...permissions } = state.permissions;
    const { [communityId]: _invites, ...invites } = state.invites;
    this.port.set({
      byId: dropIds(state.byId, [communityId]),
      permissions,
      invites,
    });
    for (const part of this.parts) part.dropCommunity(communityId);
  }
}
