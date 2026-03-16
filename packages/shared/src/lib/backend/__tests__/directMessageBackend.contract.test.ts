import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { centralDirectMessageBackend } from '@shared/lib/backend/directMessageBackend';
import { centralSocialBackend } from '@shared/lib/backend/socialBackend';
import { loadBootstrappedTestUsers } from '@test-support/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '@test-support/setup/supabaseLocal';

const createTestImageFile = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dm-test.png', {
    type: 'image/png',
  });

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
    expect(sent.attachments).toEqual([]);

    const sentImage = await centralDirectMessageBackend.sendMessage({
      conversationId,
      content: '',
      metadata: {},
      imageUpload: {
        file: createTestImageFile(),
        expiresInHours: 24,
      },
    });
    expect(sentImage.attachments).toHaveLength(1);
    expect(sentImage.attachments[0]?.mediaKind).toBe('image');
    expect(sentImage.attachments[0]?.signedUrl).toBeTruthy();

    await signInAsTestUser('member_b');
    const messages = await centralDirectMessageBackend.listMessages({ conversationId, limit: 20 });
    expect(messages.some((message) => message.messageId === sent.messageId)).toBe(true);
    const listedImage = messages.find((message) => message.messageId === sentImage.messageId);
    expect(listedImage?.attachments).toHaveLength(1);
    expect(listedImage?.attachments[0]?.mimeType).toBe('image/png');
    expect(listedImage?.attachments[0]?.signedUrl).toBeTruthy();

    const conversations = await centralDirectMessageBackend.listConversations();
    const listedConversation = conversations.find(
      (conversation) => conversation.conversationId === conversationId
    );
    expect(listedConversation?.lastMessagePreview).toBe('Sent an image');

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

