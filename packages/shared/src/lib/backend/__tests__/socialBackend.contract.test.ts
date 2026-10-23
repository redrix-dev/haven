import { describe, beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  resetFixtureDomainState,
  signInAsTestUser,
  signOutTestUser,
  testBackends,
} from "@test-support/setup/supabaseLocal";

describe.sequential("SocialBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser("member_a");
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser("member_a");
  });

  it("searches by exact username and can send/accept a friend request", async () => {
    const searchResults = await testBackends.social.searchUsersForFriendAdd(
      users.member_b.username,
    );
    expect(searchResults.some((row) => row.userId === users.member_b.id)).toBe(
      true,
    );

    let requestId: string | null = null;
    try {
      requestId = await testBackends.social.sendFriendRequest(
        users.member_b.username,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase();
      if (
        !message.includes("already") &&
        !message.includes("this user already sent you")
      ) {
        throw error;
      }
    }

    await signInAsTestUser("member_b");
    const requests = await testBackends.social.listFriendRequests();
    const incoming = requests.find(
      (request) =>
        request.senderUserId === users.member_a.id &&
        request.direction === "incoming",
    );
    expect(incoming).toBeTruthy();

    if (incoming) {
      await testBackends.social.acceptFriendRequest(incoming.requestId);
    } else if (requestId) {
      await testBackends.social.acceptFriendRequest(requestId);
    }

    const friendList = await testBackends.social.listFriends();
    expect(
      friendList.some((friend) => friend.friendUserId === users.member_a.id),
    ).toBe(true);

    const recipientNotifications =
      await testBackends.notifications.listNotifications({ limit: 20 });
    expect(
      recipientNotifications.some(
        (notification) => notification.kind === "friend_request_received",
      ),
    ).toBe(false);

    await signInAsTestUser("member_a");
    const senderNotifications =
      await testBackends.notifications.listNotifications({ limit: 20 });
    expect(
      senderNotifications.some(
        (notification) => notification.kind === "friend_request_accepted",
      ),
    ).toBe(true);
  });
});
