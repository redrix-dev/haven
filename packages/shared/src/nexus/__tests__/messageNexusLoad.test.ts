import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { CommunityMessageNexus } from '@shared/nexus/community/CommunityMessageNexus';
import type { MessageBundle } from '@shared/lib/backend/types';

const bundle = (overrides: Partial<MessageBundle>): MessageBundle =>
  ({
    id: 'm1',
    channelId: 'c1',
    authorUserId: 'u1',
    displayName: 'alice',
    avatarSnapshotUrl: null,
    content: 'hi',
    metadata: {},
    replyToMessageId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    isHidden: false,
    isPlatformStaff: false,
    reactions: [],
    attachment: null,
    linkPreview: null,
    ...overrides,
  });

describe('CommunityMessageNexus.loadInitial', () => {
  it('throws without backend', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    await expect(nexus.loadInitial('c1')).rejects.toThrow(/backend attached/);
  });

  it('fetches initial page and dedupes concurrent calls', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    const listChannelMessages = vi.fn(async () => ({
      messages: [bundle({}), bundle({ id: 'm2', createdAt: '2026-01-01T00:00:01.000Z' })],
      hasMore: true,
    }));
    nexus.setCommunityData({ listChannelMessages } as never);

    await Promise.all([nexus.loadInitial('c1'), nexus.loadInitial('c1')]);
    expect(listChannelMessages).toHaveBeenCalledTimes(1);
    expect(nexus.getSnapshot('m1')).toBeDefined();
  });

  it('loadOlder paginates from oldest message', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    let page = 0;
    const listChannelMessages = vi.fn(async () => {
      page += 1;
      if (page === 1) {
        return {
          messages: [bundle({ id: 'm2', createdAt: '2026-01-01T00:00:02.000Z' })],
          hasMore: true,
        };
      }
      return {
        messages: [bundle({ id: 'm1', createdAt: '2026-01-01T00:00:00.000Z' })],
        hasMore: false,
      };
    });
    nexus.setCommunityData({ listChannelMessages } as never);

    await nexus.loadInitial('c1');
    await nexus.loadOlder('c1');

    expect(listChannelMessages).toHaveBeenCalledTimes(2);
    expect(nexus.getSnapshot('m1')).toBeDefined();
    expect(nexus.getSnapshot('m2')).toBeDefined();
  });

  it('loadOlder is a no-op when hasMore is false', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    const listChannelMessages = vi.fn(async () => ({
      messages: [bundle({})],
      hasMore: false,
    }));
    nexus.setCommunityData({ listChannelMessages } as never);

    await nexus.loadInitial('c1');
    await nexus.loadOlder('c1');
    expect(listChannelMessages).toHaveBeenCalledTimes(1);
  });
});

describe('CommunityMessageNexus.send / edit / delete / toggleReaction', () => {
  it('send delegates to the backend', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    const sendUserMessage = vi.fn(async () => ({ id: 'new1' }));
    nexus.setCommunityData({ sendUserMessage } as never);

    const result = await nexus.send('c1', 'hello', { replyToMessageId: 'r1' });
    expect(sendUserMessage).toHaveBeenCalledWith({
      communityId: 's1',
      channelId: 'c1',
      content: 'hello',
      replyToMessageId: 'r1',
    });
    expect(result.id).toBe('new1');
  });

  it('edit delegates to the backend', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    const editUserMessage = vi.fn(async () => undefined);
    nexus.setCommunityData({ editUserMessage } as never);

    await nexus.edit('m1', 'new content');
    expect(editUserMessage).toHaveBeenCalledWith({
      communityId: 's1',
      messageId: 'm1',
      content: 'new content',
    });
  });

  it('toggleReaction delegates to the backend', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    const toggleMessageReaction = vi.fn(async () => undefined);
    nexus.setCommunityData({ toggleMessageReaction } as never);

    await nexus.toggleReaction('c1', 'm1', '👍');
    expect(toggleMessageReaction).toHaveBeenCalledWith({
      communityId: 's1',
      channelId: 'c1',
      messageId: 'm1',
      emoji: '👍',
    });
  });
});
