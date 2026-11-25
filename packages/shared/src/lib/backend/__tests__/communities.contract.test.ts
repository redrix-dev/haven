import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  eventually,
  hearthId,
  signOutAll,
} from "@test-support/setup/supabaseLocal";
import type { HavenEvent } from "@shared/lib/backend";

describe.sequential("communities (contract)", { timeout: 20_000 }, () => {
  afterAll(signOutAll);

  it("a member loads the community they are in, and only that", async () => {
    const memberA = await actor("member_a");
    const mine = await memberA.backend.communities.listMyCommunities();
    expect(mine.map((c) => c.name)).toContain("TEST: Hearth");

    const hearth = await memberA.backend.communities.loadCommunity(hearthId());
    expect(hearth.community.name).toBe("TEST: Hearth");
    expect(hearth.members.map((m) => m.user_id)).toContain(memberA.id);
    expect(hearth.roles.some((role) => role.is_everyone)).toBe(true);

    const channels =
      await memberA.backend.channels.listCommunityChannels(hearthId());
    const names = channels.map((channel) => channel.name);
    expect(names).toEqual(
      expect.arrayContaining(["general", "read-only", "Lounge"]),
    );
    expect(names).not.toContain("staff-room");

    const stranger = await actor("non_member");
    await expect(
      stranger.backend.communities.loadCommunity(hearthId()),
    ).rejects.toMatchObject({ reason: "community_not_found" });
  });

  it("permissions come from the database: the owner has all, a member some", async () => {
    const owner = await actor("community_owner");
    const memberA = await actor("member_a");
    const ownerCan =
      await owner.backend.communities.getMyPermissions(hearthId());
    const memberCan =
      await memberA.backend.communities.getMyPermissions(hearthId());
    expect(ownerCan).toContain("manage_community");
    expect(memberCan).toContain("send_messages");
    expect(memberCan).not.toContain("manage_community");
  });

  it("a new community can be made, joined by invite, and deleted, and members hear it", async () => {
    const owner = await actor("community_owner");
    const memberA = await actor("member_a");
    const made = await owner.backend.communities.createCommunity(
      `TEST: contract ${Date.now()}`,
    );
    try {
      const invite = await owner.backend.communities.createInvite(made.id, {
        max_uses: 1,
      });
      const joined = await memberA.backend.communities.joinCommunity(
        invite.code,
      );
      expect(joined.id).toBe(made.id);

      const heard: HavenEvent[] = [];
      let connected = false;
      const stop = memberA.backend.realtime.subscribeToMyEvents(memberA.id, {
        onEvent: (event) => heard.push(event),
        onConnected: () => {
          connected = true;
        },
      });
      try {
        await eventually(() => connected);
        await owner.backend.channels.createChannel(made.id, "text", "news");
        await eventually(() =>
          heard.find(
            (e) => e.event === "channel.created" && e.payload.name === "news",
          ),
        );
        await owner.backend.communities.deleteCommunity(made.id);
        await eventually(() =>
          heard.find(
            (e) => e.event === "community.deleted" && e.payload.id === made.id,
          ),
        );
      } finally {
        stop();
      }
    } finally {
      await owner.backend.communities.deleteCommunity(made.id).catch(() => {});
    }
  });

  it("a member cannot manage what they may not manage", async () => {
    const memberA = await actor("member_a");
    await expect(
      memberA.backend.communities.updateCommunity(hearthId(), {
        name: "mine now",
      }),
    ).rejects.toMatchObject({
      kind: "forbidden",
      reason: "missing_permission",
    });
    expect(await memberA.backend.communities.listBans(hearthId())).toEqual([]);
  });
});
