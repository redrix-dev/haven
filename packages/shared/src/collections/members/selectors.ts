/** Views over `MembersState`, worked out when read. Both platforms use these. */

import type {
  CommunityBan,
  CommunityMember,
} from "@shared/lib/backend/records";
import type { ProfilesState } from "../profiles/profiles";
import { memberKey, type MembersState } from "./members";

/** The community's members in the order they joined, then by id. */
export function membersOf(
  state: MembersState,
  communityId: string,
): CommunityMember[] {
  return Object.values(state.byKey)
    .filter((member) => member.community_id === communityId)
    .sort(
      (a, b) =>
        (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0) ||
        (a.user_id < b.user_id ? -1 : 1),
    );
}

/**
 * What to call someone in a community: their nickname there, else their
 * username. Null while their profile is not loaded, or once their account
 * is deleted.
 */
export function displayName(
  members: MembersState,
  profiles: ProfilesState,
  communityId: string,
  userId: string,
): string | null {
  return (
    members.byKey[memberKey(communityId, userId)]?.nickname ??
    profiles.byId[userId]?.username ??
    null
  );
}

/** Who is banned, newest ban first. Empty until loaded. */
export function bansOf(
  state: MembersState,
  communityId: string,
): CommunityBan[] {
  return Object.values(state.bans[communityId] ?? {}).sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}
