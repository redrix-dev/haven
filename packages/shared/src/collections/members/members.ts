/**
 * Members: who is in each community the person belongs to, with their
 * nicknames, and (for people who manage bans) who is banned.
 * DATABASE.md: "Communities".
 *
 * Members arrive with the community (`communities` hands them over) and stay
 * current from `member.*` events. Nothing here is kept on the device: a
 * membership can be ended by a moderator.
 */

import type {
  CommunitiesBackend,
  CommunityStructure,
} from "@shared/lib/backend/communities";
import type {
  CommunityBan,
  CommunityMember,
} from "@shared/lib/backend/records";
import type { CommunityPart } from "../communities/communities";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, dropWhere, putRowsBy } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** A membership's key: one person in one community. */
export const memberKey = (communityId: string, userId: string) =>
  `${communityId}:${userId}`;

const keyOf = (row: { community_id: string; user_id: string }) =>
  memberKey(row.community_id, row.user_id);

export type MembersState = {
  /** By `memberKey`. */
  byKey: ById<CommunityMember>;
  /** By community id, then banned person's id. Loaded only for people who manage bans. */
  bans: Readonly<Record<string, ById<CommunityBan>>>;
  requests: RequestMap;
};

export const createMembersState = (): MembersState => ({
  byKey: {},
  bans: {},
  requests: {},
});

export type MembersBackendPart = Pick<
  CommunitiesBackend,
  "kickMember" | "banMember" | "unbanMember" | "listBans" | "setNickname"
>;

export class Members implements CommunityPart {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<MembersState>,
    private readonly backend: MembersBackendPart,
  ) {
    this.requests = new Requests("members", port);
  }

  get(communityId: string, userId: string): CommunityMember | undefined {
    return this.port.get().byKey[memberKey(communityId, userId)];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  takeStructure({ community, members }: CommunityStructure): void {
    const kept = dropWhere(
      this.port.get().byKey,
      (member) => member.community_id === community.id,
    );
    this.port.set({ byKey: putRowsBy(kept, members, keyOf) });
  }

  /** Needs `manage_bans`; without it the list is simply empty. */
  loadBans(communityId: string): Promise<void> {
    return this.requests.run(`bans:${communityId}`, async (stale) => {
      const bans = await this.backend.listBans(communityId);
      if (stale()) return;
      this.setBans(
        communityId,
        putRowsBy({}, bans, (ban) => ban.user_id),
      );
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** The member is gone with `member.left`. */
  async kick(communityId: string, userId: string): Promise<void> {
    await this.backend.kickMember(communityId, userId);
    this.applyLeft({ community_id: communityId, user_id: userId });
  }

  /** The ban list shows it once reloaded: the event does not carry the row. */
  async ban(
    communityId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.backend.banMember(communityId, userId, reason);
    this.applyLeft({ community_id: communityId, user_id: userId });
    if (this.port.get().bans[communityId]) await this.loadBans(communityId);
  }

  async unban(communityId: string, userId: string): Promise<void> {
    await this.backend.unbanMember(communityId, userId);
    this.applyUnbanned(communityId, userId);
  }

  /** Null clears it. The person's own, or with `manage_members`. */
  async setNickname(
    communityId: string,
    userId: string,
    nickname: string | null,
  ): Promise<void> {
    this.applyMember(
      await this.backend.setNickname(communityId, userId, nickname),
    );
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** `member.joined` and `member.updated`. */
  applyMember(member: CommunityMember): void {
    this.port.set({
      byKey: putRowsBy(this.port.get().byKey, [member], keyOf),
    });
  }

  applyLeft(member: Pick<CommunityMember, "community_id" | "user_id">): void {
    this.port.set({ byKey: dropIds(this.port.get().byKey, [keyOf(member)]) });
  }

  /** The event carries no row, so a ban list that is held loads again. */
  applyBanned(communityId: string): void {
    if (this.port.get().bans[communityId]) void this.loadBans(communityId);
  }

  applyUnbanned(communityId: string, userId: string): void {
    const bans = this.port.get().bans[communityId];
    if (bans) this.setBans(communityId, dropIds(bans, [userId]));
  }

  dropCommunity(communityId: string): void {
    this.requests.forget(`bans:${communityId}`);
    const { [communityId]: _bans, ...bans } = this.port.get().bans;
    this.port.set({
      byKey: dropWhere(
        this.port.get().byKey,
        (member) => member.community_id === communityId,
      ),
      bans,
    });
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createMembersState());
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  private setBans(communityId: string, bans: ById<CommunityBan>): void {
    this.port.set({ bans: { ...this.port.get().bans, [communityId]: bans } });
  }
}
