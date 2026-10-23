import { describe, beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  resetFixtureDomainState,
  signInAsTestUser,
  signOutTestUser,
  testBackends,
} from "@test-support/setup/supabaseLocal";

const createTestImageFile = () =>
  new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    "dm-moderation-test.png",
    {
      type: "image/png",
    },
  );

async function ensureDmReportFixture(memberAUsername: string) {
  await signInAsTestUser("member_b");
  try {
    await testBackends.social.sendFriendRequest(memberAUsername);
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    if (!msg.includes("already") && !msg.includes("friends")) throw error;
  }

  await signInAsTestUser("member_a");
  const requests = await testBackends.social.listFriendRequests();
  const incoming = requests.find(
    (row) =>
      row.direction === "incoming" &&
      row.senderUserId === loadBootstrappedTestUsers().member_b.id,
  );
  if (incoming) {
    await testBackends.social.acceptFriendRequest(incoming.requestId);
  }

  const conversationId =
    await testBackends.directMessages.getOrCreateDirectConversation(
      loadBootstrappedTestUsers().member_b.id,
    );
  const sent = await testBackends.directMessages.sendMessage({
    conversationId,
    content: "",
    metadata: {},
    imageUpload: {
      body: createTestImageFile(),
      filename: "test.png",
      expiresInHours: 24,
    },
  });

  await signInAsTestUser("member_b");
  const reportId = await testBackends.directMessages.reportMessage({
    messageId: sent.messageId,
    kind: "content_abuse",
    comment: "Moderation backend contract test report",
  });

  return { conversationId, messageId: sent.messageId, reportId };
}

describe.sequential("ModerationBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser("platform_staff_active");
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser("platform_staff_active");
  });

  it("lists, assigns, updates, and audits DM reports for active staff", async () => {
    const fixture = await ensureDmReportFixture(users.member_a.username);

    await signInAsTestUser("platform_staff_active");
    const reports = await testBackends.moderation.listDmMessageReportsForReview(
      {
        limit: 50,
      },
    );
    const target = reports.find(
      (report) => report.reportId === fixture.reportId,
    );
    expect(target).toBeTruthy();
    expect(target?.messagePreview).toBe("Sent an image");

    const detail = await testBackends.moderation.getDmMessageReportDetail(
      fixture.reportId,
    );
    expect(detail?.messageId).toBe(fixture.messageId);
    expect(detail?.messageAttachments).toHaveLength(1);
    expect(detail?.messageAttachments[0]?.signedUrl).toBeTruthy();

    const context = await testBackends.moderation.listDmMessageContext({
      messageId: fixture.messageId,
      before: 5,
      after: 5,
    });
    expect(
      context.some(
        (row) => row.messageId === fixture.messageId && row.isTarget,
      ),
    ).toBe(true);
    const targetContextRow = context.find(
      (row) => row.messageId === fixture.messageId,
    );
    expect(targetContextRow?.attachments).toHaveLength(1);
    expect(targetContextRow?.attachments[0]?.signedUrl).toBeTruthy();

    const assigned = await testBackends.moderation.assignDmMessageReport({
      reportId: fixture.reportId,
      assigneeUserId: users.platform_staff_active.id,
      notes: "Take ownership",
    });
    expect(assigned).toBe(true);

    await expect(
      testBackends.moderation.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: "resolved_actioned",
        notes: "Invalid jump should fail after hardening",
      }),
    ).rejects.toThrow(/transition/i);

    expect(
      await testBackends.moderation.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: "triaged",
        notes: "Triaged",
      }),
    ).toBe(true);
    expect(
      await testBackends.moderation.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: "in_review",
        notes: "Investigating",
      }),
    ).toBe(true);
    expect(
      await testBackends.moderation.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: "resolved_no_action",
        notes: "No action",
      }),
    ).toBe(true);

    const actions = await testBackends.moderation.listDmMessageReportActions(
      fixture.reportId,
    );
    expect(actions.length).toBeGreaterThan(0);
  });

  it("rejects inactive/non-staff access to moderation review RPCs", async () => {
    await signInAsTestUser("platform_staff_inactive");
    await expect(
      testBackends.moderation.listDmMessageReportsForReview({ limit: 5 }),
    ).rejects.toThrow(/haven staff/i);

    await signInAsTestUser("member_a");
    await expect(
      testBackends.moderation.listDmMessageReportsForReview({ limit: 5 }),
    ).rejects.toThrow(/haven staff/i);
  });
});
