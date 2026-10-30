import { loadBootstrappedTestUsers, type TestUserKey } from "../fixtures/users";
import { signInAsTestUser, testBackends } from "./supabaseLocal";

export type ScratchCommunity = {
  communityId: string;
  /** The invite members joined with (unlimited uses, one hour). */
  inviteCode: string;
  /** community_members.id of each member, keyed like the test users. */
  memberIds: Partial<Record<TestUserKey, string>>;
  /** Delete the community (as its owner). Call in afterAll. */
  dispose: () => Promise<void>;
};

/**
 * A throwaway community for a contract test that changes channels, roles,
 * settings or membership — state the shared fixture reset does not undo.
 * Built the way the app builds one: community_owner creates it, allows
 * invites, and each member joins through an invite. If setup fails partway
 * the community is deleted before the error is rethrown. Leaves
 * community_owner signed in.
 */
export async function createScratchCommunity(
  label: string,
  members: TestUserKey[],
): Promise<ScratchCommunity> {
  await signInAsTestUser("community_owner");
  const { id: communityId } = await testBackends.controlPlane.createCommunity(
    `TEST:contract ${label} ${Date.now()}`,
  );
  const dispose = async () => {
    await signInAsTestUser("community_owner");
    await testBackends.controlPlane.deleteCommunity(communityId);
  };

  try {
    // New communities refuse invite joins until the owner allows them.
    const settings =
      await testBackends.communityData.fetchServerSettings(communityId);
    await testBackends.communityData.updateServerSettings({
      communityId,
      values: { ...settings, allowPublicInvites: true },
    });
    const invite = await testBackends.controlPlane.createCommunityInvite({
      communityId,
      maxUses: null,
      expiresInHours: 1,
    });
    for (const member of members) {
      await signInAsTestUser(member);
      await testBackends.controlPlane.redeemCommunityInvite(invite.code);
    }

    await signInAsTestUser("community_owner");
    const users = loadBootstrappedTestUsers();
    const roster =
      await testBackends.communityData.listCommunityMembers(communityId);
    const memberIds: Partial<Record<TestUserKey, string>> = {};
    for (const key of ["community_owner", ...members] as TestUserKey[]) {
      memberIds[key] = roster.find((m) => m.userId === users[key].id)?.memberId;
    }
    return { communityId, inviteCode: invite.code, memberIds, dispose };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  }
}
