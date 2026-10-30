import { describe, beforeAll, afterAll, expect, it } from "vitest";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  createScratchCommunity,
  type ScratchCommunity,
} from "@test-support/setup/scratchCommunity";
import {
  signInAsTestUser,
  signOutTestUser,
  testBackends,
} from "@test-support/setup/supabaseLocal";

/**
 * The member part against the real database, in a throwaway community: the
 * viewer's permissions, the member list, and kick / ban / unban — including
 * that a kicked or banned member's community list drops the community, which
 * is what the client's access-loss handling reacts to.
 */
describe.sequential("CommunityMemberBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();
  const backend = testBackends.communityData;
  const controlPlane = testBackends.controlPlane;
  let scratch: ScratchCommunity;
  let communityId = "";

  const memberUserIds = async () =>
    (await backend.listCommunityMembers(communityId))
      .map((m) => m.userId)
      .sort();
  const isInMyCommunities = async (key: "member_a" | "member_b") =>
    (await controlPlane.listUserCommunities(users[key].id)).some(
      (c) => c.id === communityId,
    );
  // The list holds active bans only: an unban removes the row from it.
  const bannedUserIds = async () =>
    (await backend.listCommunityBans(communityId)).map(
      (ban) => ban.bannedUserId,
    );

  beforeAll(async () => {
    scratch = await createScratchCommunity("members", ["member_a", "member_b"]);
    communityId = scratch.communityId;
  });

  afterAll(async () => {
    await scratch?.dispose();
    await signOutTestUser();
  });

  it("getMyPermissions: the owner holds everything, a plain member does not", async () => {
    await signInAsTestUser("community_owner");
    expect(await backend.getMyPermissions(communityId)).toMatchObject({
      isOwner: true,
      isElevated: true,
      canManageMessages: true,
      canManageMembers: true,
      canManageBans: true,
    });

    await signInAsTestUser("member_a");
    expect(await backend.getMyPermissions(communityId)).toMatchObject({
      isOwner: false,
      isElevated: false,
      canManageMessages: false,
      canManageMembers: false,
      canManageBans: false,
      canCreateReports: true,
    });
  });

  it("every member sees the full member list, owner flagged", async () => {
    await signInAsTestUser("member_a");
    const members = await backend.listCommunityMembers(communityId);
    expect(members.map((m) => m.userId).sort()).toEqual(
      [users.community_owner.id, users.member_a.id, users.member_b.id].sort(),
    );
    expect(members.find((m) => m.isOwner)?.userId).toBe(
      users.community_owner.id,
    );
  });

  it("a plain member cannot kick", async () => {
    await signInAsTestUser("member_a");
    await expect(
      backend.kickCommunityMember({
        communityId,
        targetUserId: users.member_b.id,
      }),
    ).rejects.toBeTruthy();
    await signInAsTestUser("community_owner");
    expect(await memberUserIds()).toContain(users.member_b.id);
  });

  it("a kick removes the member, and the community leaves their list", async () => {
    await signInAsTestUser("community_owner");
    expect(
      await backend.kickCommunityMember({
        communityId,
        targetUserId: users.member_b.id,
      }),
    ).toEqual({ kickedUserId: users.member_b.id, communityId });
    expect(await memberUserIds()).not.toContain(users.member_b.id);

    await signInAsTestUser("member_b");
    expect(await isInMyCommunities("member_b")).toBe(false);
  });

  it("a ban removes the member and blocks rejoining until it is lifted", async () => {
    await signInAsTestUser("community_owner");
    expect(
      await backend.banCommunityMember({
        communityId,
        targetUserId: users.member_a.id,
        reason: "contract test",
      }),
    ).toEqual({ bannedUserId: users.member_a.id, communityId });
    expect(await bannedUserIds()).toEqual([users.member_a.id]);
    expect(await memberUserIds()).not.toContain(users.member_a.id);

    await signInAsTestUser("member_a");
    expect(await isInMyCommunities("member_a")).toBe(false);
    await expect(
      controlPlane.redeemCommunityInvite(scratch.inviteCode),
    ).rejects.toBeTruthy();

    await signInAsTestUser("community_owner");
    await backend.unbanCommunityMember({
      communityId,
      targetUserId: users.member_a.id,
    });
    expect(await bannedUserIds()).toEqual([]);

    await signInAsTestUser("member_a");
    await controlPlane.redeemCommunityInvite(scratch.inviteCode);
    expect(await isInMyCommunities("member_a")).toBe(true);
  });
});
