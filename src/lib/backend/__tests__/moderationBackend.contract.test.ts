import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { centralDirectMessageBackend } from '@/lib/backend/directMessageBackend';
import { centralModerationBackend } from '@/lib/backend/moderationBackend';
import { centralSocialBackend } from '@/lib/backend/socialBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '../../../../test/setup/supabaseLocal';

async function ensureDmReportFixture(memberAUsername: string) {
  await signInAsTestUser('member_b');
  try {
    await centralSocialBackend.sendFriendRequest(memberAUsername);
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!msg.includes('already') && !msg.includes('friends')) throw error;
  }

  await signInAsTestUser('member_a');
  const requests = await centralSocialBackend.listFriendRequests();
  const incoming = requests.find(
    (row) => row.direction === 'incoming' && row.senderUserId === loadBootstrappedTestUsers().member_b.id
  );
  if (incoming) {
    await centralSocialBackend.acceptFriendRequest(incoming.requestId);
  }

  const conversationId = await centralDirectMessageBackend.getOrCreateDirectConversation(loadBootstrappedTestUsers().member_b.id);
  const sent = await centralDirectMessageBackend.sendMessage({
    conversationId,
    content: 'Message for moderation backend contract test',
    metadata: {},
  });

  await signInAsTestUser('member_b');
  const reportId = await centralDirectMessageBackend.reportMessage({
    messageId: sent.messageId,
    kind: 'content_abuse',
    comment: 'Moderation backend contract test report',
  });

  return { conversationId, messageId: sent.messageId, reportId };
}

describe.sequential('ModerationBackend (contract)', () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser('platform_staff_active');
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser('platform_staff_active');
  });

  it('lists, assigns, updates, and audits DM reports for active staff', async () => {
    const fixture = await ensureDmReportFixture(users.member_a.username);

    await signInAsTestUser('platform_staff_active');
    const reports = await centralModerationBackend.listDmMessageReportsForReview({ limit: 50 });
    const target = reports.find((report) => report.reportId === fixture.reportId);
    expect(target).toBeTruthy();

    const detail = await centralModerationBackend.getDmMessageReportDetail(fixture.reportId);
    expect(detail?.messageId).toBe(fixture.messageId);

    const context = await centralModerationBackend.listDmMessageContext({ messageId: fixture.messageId, before: 5, after: 5 });
    expect(context.some((row) => row.messageId === fixture.messageId && row.isTarget)).toBe(true);

    const assigned = await centralModerationBackend.assignDmMessageReport({
      reportId: fixture.reportId,
      assigneeUserId: users.platform_staff_active.id,
      notes: 'Take ownership',
    });
    expect(assigned).toBe(true);

    await expect(
      centralModerationBackend.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: 'resolved_actioned',
        notes: 'Invalid jump should fail after hardening',
      })
    ).rejects.toThrow(/transition/i);

    expect(
      await centralModerationBackend.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: 'triaged',
        notes: 'Triaged',
      })
    ).toBe(true);
    expect(
      await centralModerationBackend.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: 'in_review',
        notes: 'Investigating',
      })
    ).toBe(true);
    expect(
      await centralModerationBackend.updateDmMessageReportStatus({
        reportId: fixture.reportId,
        status: 'resolved_no_action',
        notes: 'No action',
      })
    ).toBe(true);

    const actions = await centralModerationBackend.listDmMessageReportActions(fixture.reportId);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('rejects inactive/non-staff access to moderation review RPCs', async () => {
    await signInAsTestUser('platform_staff_inactive');
    await expect(centralModerationBackend.listDmMessageReportsForReview({ limit: 5 })).rejects.toThrow(/haven staff/i);

    await signInAsTestUser('member_a');
    await expect(centralModerationBackend.listDmMessageReportsForReview({ limit: 5 })).rejects.toThrow(/haven staff/i);
  });
});
