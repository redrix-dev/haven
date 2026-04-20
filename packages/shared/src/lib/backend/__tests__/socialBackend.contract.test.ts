import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { getNotificationBackend, getSocialBackend } from '@shared/lib/backend';
import { loadBootstrappedTestUsers } from '@test-support/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '@test-support/setup/supabaseLocal';

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
    const searchResults = await getSocialBackend().searchUsersForFriendAdd(users.member_b.username);
    expect(searchResults.some((row) => row.userId === users.member_b.id)).toBe(true);

    let requestId: string | null = null;
    try {
      requestId = await getSocialBackend().sendFriendRequest(users.member_b.username);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes('already') && !message.includes('this user already sent you')) {
        throw error;
      }
    }

    await signInAsTestUser('member_b');
    const requests = await getSocialBackend().listFriendRequests();
    const incoming = requests.find((request) => request.senderUserId === users.member_a.id && request.direction === 'incoming');
    expect(incoming).toBeTruthy();

    if (incoming) {
      await getSocialBackend().acceptFriendRequest(incoming.requestId);
    } else if (requestId) {
      await getSocialBackend().acceptFriendRequest(requestId);
    }

    const friendList = await getSocialBackend().listFriends();
    expect(friendList.some((friend) => friend.friendUserId === users.member_a.id)).toBe(true);

    const recipientNotifications = await getNotificationBackend().listNotifications({ limit: 20 });
    expect(recipientNotifications.some((notification) => notification.kind === 'friend_request_received')).toBe(false);

    await signInAsTestUser('member_a');
    const senderNotifications = await getNotificationBackend().listNotifications({ limit: 20 });
    expect(senderNotifications.some((notification) => notification.kind === 'friend_request_accepted')).toBe(true);
  });
});

