/**
 * Roles: each community's roles, what each role allows, and who holds which.
 * DATABASE.md: "Communities".
 *
 * Roles come with the community (`communities` hands them over). Role rows
 * have their own events; which permissions a role has and who holds it do
 * not. A change to either sends `access.changed`, and the community loads
 * again, so those two are always the database's answer, never guessed here.
 *
 * What the person may do is not worked out from these: that is one question
 * to the database (`communities.permissions`). These are for showing roles.
 */

import type {
  CommunitiesBackend,
  CommunityStructure,
  RoleChanges,
} from "@shared/lib/backend/communities";
import type { Permission, Role } from "@shared/lib/backend/records";
import type { CommunityPart } from "../communities/communities";
import { memberKey } from "../members/members";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

export type RolesState = {
  byId: ById<Role>;
  /** What each role allows, by role id. */
  permissions: Readonly<Record<string, readonly Permission[]>>;
  /** The roles each member holds, by `memberKey`. The everyone role is implied. */
  held: Readonly<Record<string, readonly string[]>>;
  requests: RequestMap;
};

export const createRolesState = (): RolesState => ({
  byId: {},
  permissions: {},
  held: {},
  requests: {},
});

export type RolesBackendPart = Pick<
  CommunitiesBackend,
  | "createRole"
  | "updateRole"
  | "deleteRole"
  | "setRolePermissions"
  | "setMemberRoles"
>;

export class Roles implements CommunityPart {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<RolesState>,
    private readonly backend: RolesBackendPart,
  ) {
    this.requests = new Requests("roles", port);
  }

  get(roleId: string): Role | undefined {
    return this.port.get().byId[roleId];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  takeStructure(structure: CommunityStructure): void {
    const communityId = structure.community.id;
    const state = this.withoutCommunity(communityId);
    const permissions: Record<string, Permission[]> = {};
    for (const role of structure.roles) permissions[role.id] = [];
    for (const row of structure.role_permissions) {
      (permissions[row.role_id] ??= []).push(row.permission);
    }
    const held: Record<string, string[]> = {};
    for (const row of structure.member_roles) {
      (held[memberKey(row.community_id, row.user_id)] ??= []).push(row.role_id);
    }
    this.port.set({
      byId: putRows(state.byId, structure.roles),
      permissions: { ...state.permissions, ...permissions },
      held: { ...state.held, ...held },
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────
  // Permissions and holders come back with the reload `access.changed` asks
  // for; the role rows come back in the answer or their own event.

  async create(
    communityId: string,
    name: string,
    options?: { color?: string; position?: number },
  ): Promise<Role> {
    const role = await this.backend.createRole(communityId, name, options);
    this.applyRole(role);
    return role;
  }

  async update(roleId: string, changes: RoleChanges): Promise<void> {
    this.applyRole(await this.backend.updateRole(roleId, changes));
  }

  async remove(roleId: string): Promise<void> {
    await this.backend.deleteRole(roleId);
    this.applyRoleDeleted(roleId);
  }

  async setPermissions(
    roleId: string,
    permissions: Permission[],
  ): Promise<void> {
    await this.backend.setRolePermissions(roleId, permissions);
  }

  async setMemberRoles(
    communityId: string,
    userId: string,
    roleIds: string[],
  ): Promise<void> {
    await this.backend.setMemberRoles(communityId, userId, roleIds);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** `role.created` and `role.updated`. A new role allows nothing yet. */
  applyRole(role: Role): void {
    const { permissions } = this.port.get();
    this.port.set({
      byId: putRows(this.port.get().byId, [role]),
      permissions: permissions[role.id]
        ? permissions
        : { ...permissions, [role.id]: [] },
    });
  }

  applyRoleDeleted(roleId: string): void {
    const state = this.port.get();
    const { [roleId]: _permissions, ...permissions } = state.permissions;
    const held: Record<string, readonly string[]> = {};
    for (const [key, roleIds] of Object.entries(state.held)) {
      held[key] = roleIds.includes(roleId)
        ? roleIds.filter((id) => id !== roleId)
        : roleIds;
    }
    this.port.set({ byId: dropIds(state.byId, [roleId]), permissions, held });
  }

  /** The member left: the roles they held go with them. */
  applyLeft(communityId: string, userId: string): void {
    const { [memberKey(communityId, userId)]: _gone, ...held } =
      this.port.get().held;
    this.port.set({ held });
  }

  dropCommunity(communityId: string): void {
    this.port.set(this.withoutCommunity(communityId));
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createRolesState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private withoutCommunity(
    communityId: string,
  ): Pick<RolesState, "byId" | "permissions" | "held"> {
    const state = this.port.get();
    const gone = Object.values(state.byId)
      .filter((role) => role.community_id === communityId)
      .map((role) => role.id);
    const permissions = { ...state.permissions };
    for (const id of gone) delete permissions[id];
    const prefix = `${communityId}:`;
    const held: Record<string, readonly string[]> = {};
    for (const [key, roleIds] of Object.entries(state.held)) {
      if (!key.startsWith(prefix)) held[key] = roleIds;
    }
    return {
      byId: dropWhere(state.byId, (role) => role.community_id === communityId),
      permissions,
      held,
    };
  }
}
