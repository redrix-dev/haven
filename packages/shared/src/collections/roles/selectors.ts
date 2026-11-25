/** Views over `RolesState`, worked out when read. Both platforms use these. */

import type { Community, Role } from "@shared/lib/backend/records";
import { memberKey } from "../members/members";
import type { RolesState } from "./roles";

/** Highest first, as the database ranks them; ties by id. */
const byRank = (a: Role, b: Role) =>
  b.position - a.position || (a.id < b.id ? -1 : 1);

/** The community's roles, highest first. */
export function rolesOf(state: RolesState, communityId: string): Role[] {
  return Object.values(state.byId)
    .filter((role) => role.community_id === communityId)
    .sort(byRank);
}

/** The roles a member holds, highest first. The everyone role is not listed. */
export function rolesOfMember(
  state: RolesState,
  communityId: string,
  userId: string,
): Role[] {
  const held = state.held[memberKey(communityId, userId)] ?? [];
  return held
    .map((roleId) => state.byId[roleId])
    .filter((role): role is Role => role !== undefined && !role.is_everyone)
    .sort(byRank);
}

/** The colour a member's name shows in: their highest role's. Null without one. */
export function memberColor(
  state: RolesState,
  communityId: string,
  userId: string,
): string | null {
  return rolesOfMember(state, communityId, userId)[0]?.color ?? null;
}

/**
 * Whether one member ranks above another, for offering moderation actions.
 * Rank is the highest role position held; the owner ranks above everyone.
 * The database decides every action itself; this only hides what it would
 * refuse.
 */
export function outranks(
  state: RolesState,
  community: Pick<Community, "id" | "owner_id">,
  actorId: string,
  targetId: string,
): boolean {
  if (actorId === targetId || targetId === community.owner_id) return false;
  if (actorId === community.owner_id) return true;
  const rank = (userId: string) =>
    rolesOfMember(state, community.id, userId)[0]?.position ??
    Number.NEGATIVE_INFINITY;
  return rank(targetId) < rank(actorId);
}
