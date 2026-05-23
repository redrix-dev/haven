import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { SocialNexus } from '@shared/nexus/social/SocialNexus';
import { DEFAULT_SOCIAL_COUNTS } from '@shared/infrastructure/constants';

const makeBackend = (overrides: Record<string, unknown> = {}) =>
  ({
    getSocialCounts: vi.fn(async () => DEFAULT_SOCIAL_COUNTS),
    listMyBlocks: vi.fn(async () => []),
    listUsersBlockingMe: vi.fn(async () => []),
    listFriends: vi.fn(async () => []),
    listFriendRequests: vi.fn(async () => []),
    listBlockedUsers: vi.fn(async () => []),
    blockUser: vi.fn(async () => {}),
    acceptFriendRequest: vi.fn(async () => {}),
    declineFriendRequest: vi.fn(async () => {}),
    ...overrides,
  }) as never;

describe('SocialNexus', () => {
  it('awaits refresh after accepting and declining friend requests', async () => {
    const getSocialCounts = vi.fn(async () => DEFAULT_SOCIAL_COUNTS);
    const acceptFriendRequest = vi.fn(async () => {});
    const declineFriendRequest = vi.fn(async () => {});
    const nexus = new SocialNexus(
      createMemoryPersistence(),
      makeBackend({ getSocialCounts, acceptFriendRequest, declineFriendRequest }),
    );

    await nexus.acceptFriendRequest('fr1');
    await nexus.declineFriendRequest('fr2');

    expect(acceptFriendRequest).toHaveBeenCalledWith('fr1');
    expect(declineFriendRequest).toHaveBeenCalledWith('fr2');
    expect(getSocialCounts).toHaveBeenCalledTimes(2);
  });

  it('updates block policy and awaits refresh after blocking', async () => {
    const getSocialCounts = vi.fn(async () => DEFAULT_SOCIAL_COUNTS);
    const blockUser = vi.fn(async () => {});
    const listMyBlocks = vi.fn(async () => ['blocked-user']);
    const nexus = new SocialNexus(
      createMemoryPersistence(),
      makeBackend({ getSocialCounts, blockUser, listMyBlocks }),
    );

    await nexus.blockUser('blocked-user');

    expect(blockUser).toHaveBeenCalledWith('blocked-user');
    expect(getSocialCounts).toHaveBeenCalledTimes(1);
    expect(nexus.getHiddenAuthorIdsForViewer().has('blocked-user')).toBe(true);
  });
});
