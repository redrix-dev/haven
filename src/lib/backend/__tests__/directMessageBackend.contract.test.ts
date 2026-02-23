import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { centralDirectMessageBackend } from '@/lib/backend/directMessageBackend';
import { centralSocialBackend } from '@/lib/backend/socialBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '../../../../test/setup/supabaseLocal';

async function ensureFriendship(memberBUsername: string) {
  try {
    await centralSocialBackend.sendFriendRequest(memberBUsername);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes('already') && !message.includes('friends')) {
      throw error;
    }
  }
}

describe.sequential('DirectMessageBackend (contract)', () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser('member_a');
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser('member_a');
  });

  it('creates/loads a direct conversation, sends a message, and supports mute/report flows', async () => {
    await ensureFriendship(users.member_b.username);

    await signInAsTestUser('member_b');
    const inboundRequests = await centralSocialBackend.listFriendRequests();
    const pending = inboundRequests.find(
      (request) => request.direction === 'incoming' && request.senderUserId === users.member_a.id
    );
    if (pending) {
      await centralSocialBackend.acceptFriendRequest(pending.requestId);
    }

    const conversationId = await centralDirectMessageBackend.getOrCreateDirectConversation(users.member_a.id);
    expect(conversationId).toBeTruthy();

    await signInAsTestUser('member_a');
    const conversationIdFromA = await centralDirectMessageBackend.getOrCreateDirectConversation(users.member_b.id);
    expect(conversationIdFromA).toBe(conversationId);

    const sent = await centralDirectMessageBackend.sendMessage({
      conversationId,
      content: 'Backend contract test DM',
      metadata: {},
    });
    expect(sent.conversationId).toBe(conversationId);

    await signInAsTestUser('member_b');
    const messages = await centralDirectMessageBackend.listMessages({ conversationId, limit: 20 });
    expect(messages.some((message) => message.messageId === sent.messageId)).toBe(true);

    const read = await centralDirectMessageBackend.markConversationRead(conversationId);
    expect(read).toBe(true);

    const muted = await centralDirectMessageBackend.setConversationMuted({ conversationId, muted: true });
    expect(muted).toBe(true);

    const reportId = await centralDirectMessageBackend.reportMessage({
      messageId: sent.messageId,
      kind: 'bug',
      comment: 'Contract test report',
    });
    expect(reportId).toBeTruthy();
  });

  it('rejects non-member DM access', async () => {
    await ensureFriendship(users.member_b.username);
    await signInAsTestUser('member_b');
    const inboundRequests = await centralSocialBackend.listFriendRequests();
    const pending = inboundRequests.find(
      (request) => request.direction === 'incoming' && request.senderUserId === users.member_a.id
    );
    if (pending) {
      await centralSocialBackend.acceptFriendRequest(pending.requestId);
    }
    const conversationId = await centralDirectMessageBackend.getOrCreateDirectConversation(users.member_a.id);

    await signInAsTestUser('non_member');
    await expect(
      centralDirectMessageBackend.listMessages({ conversationId, limit: 10 })
    ).rejects.toThrow(/access/i);
  });
});

