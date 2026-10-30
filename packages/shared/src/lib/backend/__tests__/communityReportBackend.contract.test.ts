import { describe, beforeAll, afterAll, expect, it } from "vitest";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  createScratchCommunity,
  type ScratchCommunity,
} from "@test-support/setup/scratchCommunity";
import {
  serviceSupabase,
  signInAsTestUser,
  signOutTestUser,
  testBackends,
} from "@test-support/setup/supabaseLocal";

/**
 * The report part against the real database, in a throwaway community: a
 * report sent to the community's moderators reaches their modmail inbox with
 * an evidence snapshot of what was reported.
 */
describe.sequential("CommunityReportBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();
  const backend = testBackends.communityData;
  const modmail = testBackends.serverModmail;
  let scratch: ScratchCommunity;
  let communityId = "";

  beforeAll(async () => {
    scratch = await createScratchCommunity("reports", ["member_a", "member_b"]);
    communityId = scratch.communityId;
  });

  afterAll(async () => {
    await scratch?.dispose();
    await signOutTestUser();
  });

  it("a message report reaches the moderators' inbox with the message as evidence", async () => {
    await signInAsTestUser("member_b");
    const [general] = await backend.listChannels(communityId);
    const { id: messageId } = await backend.sendUserMessage({
      communityId,
      channelId: general.id,
      content: "contract: reported content",
    });

    await signInAsTestUser("member_a");
    await backend.reportMessage({
      communityId,
      channelId: general.id,
      messageId,
      reporterUserId: users.member_a.id,
      target: "server_admins",
      kind: "content_abuse",
      comment: "contract report",
    });

    await signInAsTestUser("community_owner");
    const inbox = await modmail.listServerReports([communityId]);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      communityId,
      destination: "server_admins",
      reportType: "message_report",
      status: "pending",
      reporterUserId: users.member_a.id,
    });
    // Opening it in modmail works and carries the message as evidence.
    const detail = await modmail.getServerReport(inbox[0].reportId);
    expect(detail?.linkedChannels).toEqual([
      { channelId: general.id, channelName: "general" },
    ]);
    expect(JSON.stringify(detail?.snapshot)).toContain(
      "contract: reported content",
    );
  });

  it("a profile report goes to Haven staff, not the community's moderators", async () => {
    await signInAsTestUser("member_a");
    await backend.reportUserProfile({
      communityId,
      targetUserId: users.member_b.id,
      reporterUserId: users.member_a.id,
      reason: "contract profile report",
    });

    await signInAsTestUser("community_owner");
    const inbox = await modmail.listServerReports([communityId]);
    expect(inbox.some((r) => r.reportType === "user_report")).toBe(false);

    const { data: staffRows, error } = await serviceSupabase
      .from("support_reports")
      .select("destination, notes, snapshot")
      .eq("community_id", communityId)
      .eq("destination", "haven_staff");
    if (error) throw error;
    expect(staffRows).toHaveLength(1);
    expect(staffRows[0].notes).toContain(users.member_b.id);
    expect(JSON.stringify(staffRows[0].snapshot)).toContain(
      users.member_b.username,
    );
  });
});
