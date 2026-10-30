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
 * The settings part against the real database, in a throwaway community:
 * the settings round trip, and a custom role whose permission reaches a
 * member's getMyPermissions and goes away with the role.
 */
describe.sequential("CommunitySettingsBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();
  const backend = testBackends.communityData;
  let scratch: ScratchCommunity;
  let communityId = "";

  beforeAll(async () => {
    scratch = await createScratchCommunity("settings", ["member_a"]);
    communityId = scratch.communityId;
  });

  afterAll(async () => {
    await scratch?.dispose();
    await signOutTestUser();
  });

  it("the owner's settings save round-trips", async () => {
    await signInAsTestUser("community_owner");
    const values = {
      name: "TEST:contract settings renamed",
      description: "set by the contract test",
      allowPublicInvites: true,
      requireReportReason: true,
    };

    await backend.updateServerSettings({ communityId, values });

    expect(await backend.fetchServerSettings(communityId)).toEqual(values);
  });

  it("a plain member's settings save changes nothing", async () => {
    await signInAsTestUser("community_owner");
    const before = await backend.fetchServerSettings(communityId);

    await signInAsTestUser("member_a");
    await backend
      .updateServerSettings({
        communityId,
        values: { ...before, name: "TEST:contract hijacked" },
      })
      .catch(() => undefined);

    await signInAsTestUser("community_owner");
    expect(await backend.fetchServerSettings(communityId)).toEqual(before);
  });

  it("a role's permission reaches its member and leaves with the role", async () => {
    await signInAsTestUser("community_owner");
    const memberId = scratch.memberIds.member_a!;
    await backend.createServerRole({
      communityId,
      name: "Contract role",
      color: "#336699",
      position: 10,
    });
    const snapshot = await backend.fetchServerRoleManagement(communityId);
    const role = snapshot.roles.find((r) => r.name === "Contract role");
    expect(role).toMatchObject({ isSystem: false, permissionKeys: [] });
    const currentRoleIds =
      snapshot.members.find((m) => m.memberId === memberId)?.roleIds ?? [];

    await backend.saveServerRolePermissions({
      roleId: role!.id,
      permissionKeys: ["manage_messages"],
    });
    await backend.saveServerMemberRoles({
      communityId,
      memberId,
      roleIds: [...currentRoleIds, role!.id],
      assignedByUserId: users.community_owner.id,
    });

    await signInAsTestUser("member_a");
    expect(
      (await backend.getMyPermissions(communityId)).canManageMessages,
    ).toBe(true);

    await signInAsTestUser("community_owner");
    await backend.deleteServerRole({ communityId, roleId: role!.id });

    await signInAsTestUser("member_a");
    expect(
      (await backend.getMyPermissions(communityId)).canManageMessages,
    ).toBe(false);
  });
});
