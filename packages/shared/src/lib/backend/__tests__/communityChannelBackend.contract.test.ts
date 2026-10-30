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
 * The channel part against the real database, in a throwaway community:
 * channel CRUD, groups, and a member overwrite that hides a channel.
 */
describe.sequential("CommunityChannelBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();
  const backend = testBackends.communityData;
  let scratch: ScratchCommunity;
  let communityId = "";

  const channelNames = async () =>
    (await backend.listChannels(communityId)).map((c) => c.name).sort();

  beforeAll(async () => {
    scratch = await createScratchCommunity("channels", ["member_a"]);
    communityId = scratch.communityId;
  });

  afterAll(async () => {
    await scratch?.dispose();
    await signOutTestUser();
  });

  it("the owner creates, renames and deletes a channel; members see the same list", async () => {
    await signInAsTestUser("community_owner");
    const created = await backend.createChannel({
      communityId,
      name: "contract-room",
      topic: null,
      kind: "text",
      position: 1,
    });
    await backend.updateChannel({
      communityId,
      channelId: created.id,
      name: "contract-renamed",
      topic: "a topic",
    });

    await signInAsTestUser("member_a");
    expect(await channelNames()).toEqual(["contract-renamed", "general"]);
    expect(
      (await backend.listChannels(communityId)).find((c) => c.id === created.id)
        ?.topic,
    ).toBe("a topic");

    await signInAsTestUser("community_owner");
    await backend.deleteChannel({ communityId, channelId: created.id });
    expect(await channelNames()).toEqual(["general"]);
  });

  it("a member without create_channels cannot create one", async () => {
    await signInAsTestUser("member_a");
    await expect(
      backend.createChannel({
        communityId,
        name: "not-allowed",
        topic: null,
        kind: "text",
        position: 2,
      }),
    ).rejects.toBeTruthy();

    await signInAsTestUser("community_owner");
    expect(await channelNames()).toEqual(["general"]);
  });

  it("groups: create, move a channel in, collapse, rename, delete", async () => {
    await signInAsTestUser("community_owner");
    const [general] = await backend.listChannels(communityId);
    const channelIds = [general.id];
    const groupState = () =>
      backend.listChannelGroups({ communityId, channelIds });

    const group = await backend.createChannelGroup({
      communityId,
      name: "Contract group",
      position: 0,
      createdByUserId: users.community_owner.id,
    });
    await backend.setChannelGroupForChannel({
      communityId,
      channelId: general.id,
      groupId: group.id,
      position: 0,
    });
    await backend.setChannelGroupCollapsed({
      communityId,
      groupId: group.id,
      isCollapsed: true,
    });
    await backend.renameChannelGroup({
      communityId,
      groupId: group.id,
      name: "Renamed group",
    });

    expect(await groupState()).toMatchObject({
      groups: [
        { id: group.id, name: "Renamed group", channelIds: [general.id] },
      ],
      ungroupedChannelIds: [],
      collapsedGroupIds: [group.id],
    });

    await backend.deleteChannelGroup({ communityId, groupId: group.id });
    expect(await groupState()).toMatchObject({
      groups: [],
      ungroupedChannelIds: [general.id],
    });
  });

  it("a member overwrite with canView false hides the channel until it is cleared", async () => {
    await signInAsTestUser("community_owner");
    const [general] = await backend.listChannels(communityId);
    const memberId = scratch.memberIds.member_a!;
    const save = (canView: boolean | null) =>
      backend.saveMemberChannelPermissions({
        communityId,
        channelId: general.id,
        memberId,
        permissions: { canView, canSend: null, canManage: null },
      });

    // The first revoke reports who lost access; repeating it reports nothing.
    expect(await save(false)).toEqual({
      revokedUserId: users.member_a.id,
      channelId: general.id,
      communityId,
    });
    expect(await save(false)).toBeNull();
    expect(
      await backend.listChannelRevokedUserIds({
        communityId,
        channelId: general.id,
      }),
    ).toEqual([users.member_a.id]);
    const snapshot = await backend.fetchChannelPermissions({
      communityId,
      channelId: general.id,
      userId: users.community_owner.id,
    });
    expect(
      snapshot.memberPermissions.find((m) => m.memberId === memberId),
    ).toMatchObject({ canView: false, canSend: null, canManage: null });

    await signInAsTestUser("member_a");
    expect(await channelNames()).toEqual([]);

    await signInAsTestUser("community_owner");
    expect(await save(null)).toBeNull();
    expect(
      await backend.listChannelRevokedUserIds({
        communityId,
        channelId: general.id,
      }),
    ).toEqual([]);
    await signInAsTestUser("member_a");
    expect(await channelNames()).toEqual(["general"]);
  });
});
