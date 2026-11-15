/** Views over `CommunitiesState`, worked out when read. Both platforms use these. */

import type { Community, Invite } from "@shared/lib/backend/records";
import type { CommunitiesState } from "./communities";

/** The person's communities, by name, then id. */
export function myCommunities(state: CommunitiesState): Community[] {
  return Object.values(state.byId).sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      (a.id < b.id ? -1 : 1),
  );
}

/** The community's invites, newest first. Empty until loaded. */
export function invitesOf(
  state: CommunitiesState,
  communityId: string,
): Invite[] {
  return Object.values(state.invites[communityId] ?? {}).sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}
