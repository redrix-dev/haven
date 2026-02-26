import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { centralNotificationBackend } from '@/lib/backend/notificationBackend';
import { centralSocialBackend } from '@/lib/backend/socialBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '../../../../test/setup/supabaseLocal';

describe.sequential('SocialBackend (contract)', () => {
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

  it('searches by exact username and can send/accept a friend request', async () => {
    const searchResults = await centralSocialBackend.searchUsersForFriendAdd(users.member_b.username);
    expect(searchResults.some((row) => row.userId === users.member_b.id)).toBe(true);

    let requestId: string | null = null;
    try {
      requestId = await centralSocialBackend.sendFriendRequest(users.member_b.username);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes('already') && !message.includes('this user already sent you')) {
        throw error;
      }
    }

    await signInAsTestUser('member_b');
    const requests = await centralSocialBackend.listFriendRequests();
    const incoming = requests.find((request) => request.senderUserId === users.member_a.id && request.direction === 'incoming');
    expect(incoming).toBeTruthy();

    if (incoming) {
      await centralSocialBackend.acceptFriendRequest(incoming.requestId);
    } else if (requestId) {
      await centralSocialBackend.acceptFriendRequest(requestId);
    }

    const friendList = await centralSocialBackend.listFriends();
    expect(friendList.some((friend) => friend.friendUserId === users.member_a.id)).toBe(true);

    const recipientNotifications = await centralNotificationBackend.listNotifications({ limit: 20 });
    expect(recipientNotifications.some((notification) => notification.kind === 'friend_request_received')).toBe(false);

    await signInAsTestUser('member_a');
    const senderNotifications = await centralNotificationBackend.listNotifications({ limit: 20 });
    expect(senderNotifications.some((notification) => notification.kind === 'friend_request_accepted')).toBe(true);
  });
});

