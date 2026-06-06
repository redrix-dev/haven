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

    const result = await nexus.send('c1', 'hello', {
      replyToMessageId: 'r1',
      senderUserId: 'u-staff',
      senderIsPlatformStaff: true,
    });
    expect(sendUserMessage).toHaveBeenCalledWith({
      communityId: 's1',
      channelId: 'c1',
      content: 'hello',
      replyToMessageId: 'r1',
    });
    expect(result.id).toBe('new1');
    expect(nexus.getSnapshot('new1')).toMatchObject({
      authorUserId: 'u-staff',
      isPlatformStaff: true,
    });
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

describe('CommunityMessageNexus persistence', () => {
  const loadPage = (messages: MessageBundle[], hasMore: boolean) =>
    vi.fn(async () => ({ messages, hasMore }));

  it('rehydrates a fresh nexus from persisted message tail + channel index', async () => {
    const persistence = createMemoryPersistence();
    const source = new CommunityMessageNexus('s1', persistence);
    // listChannelMessages returns newest-first; loadInitial reverses to ascending.
    source.setCommunityData({
      listChannelMessages: loadPage(
        [
          bundle({ id: 'm2', createdAt: '2026-01-01T00:00:02.000Z' }),
          bundle({ id: 'm1', createdAt: '2026-01-01T00:00:00.000Z' }),
        ],
        false,
      ),
    } as never);
    await source.loadInitial('c1');

    // A brand-new instance sharing the same persistence should see the messages.
    const restored = new CommunityMessageNexus('s1', persistence);
    restored.rehydrate();

    expect(restored.getSnapshot('m1')).toBeDefined();
    expect(restored.getSnapshot('m2')).toBeDefined();
    expect(restored.getLastMessageId('c1')).toBe('m2');
    // Whole channel fit under the cap, so hasMore stays false.
    const meta = restored.getChannelMetaSelector('c1')(
      restored.getReactiveStore().getState(),
    );
    expect(meta.hasMore).toBe(false);
  });

  it('caps the persisted tail to the newest messages per channel', async () => {
    const persistence = createMemoryPersistence();
    const source = new CommunityMessageNexus('s1', persistence);
    // 60 messages ascending m0..m59; persist should keep only the newest 50.
    const many = Array.from({ length: 60 }, (_, i) =>
      bundle({
        id: `m${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      }),
    );
    // loadInitial reverses, so feed newest-first.
    source.setCommunityData({
      listChannelMessages: loadPage([...many].reverse(), true),
    } as never);
    await source.loadInitial('c1');

    const restored = new CommunityMessageNexus('s1', persistence);
    restored.rehydrate();

    // Oldest 10 dropped; newest 50 retained.
    expect(restored.getSnapshot('m0')).toBeUndefined();
    expect(restored.getSnapshot('m10')).toBeDefined();
    expect(restored.getSnapshot('m59')).toBeDefined();
    expect(restored.getLastMessageId('c1')).toBe('m59');
    // Dropping older messages forces hasMore so scroll-up can refetch.
    const meta = restored.getChannelMetaSelector('c1')(
      restored.getReactiveStore().getState(),
    );
    expect(meta.hasMore).toBe(true);
  });

  it('getChannelAuthorIds returns unique non-null authors for priming', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    nexus.setCommunityData({
      listChannelMessages: loadPage(
        [
          bundle({ id: 'm3', authorUserId: 'u2', createdAt: '2026-01-01T00:00:03.000Z' }),
          bundle({ id: 'm2', authorUserId: 'u1', createdAt: '2026-01-01T00:00:02.000Z' }),
          bundle({ id: 'm1', authorUserId: 'u1', createdAt: '2026-01-01T00:00:01.000Z' }),
          bundle({ id: 'm0', authorUserId: null, createdAt: '2026-01-01T00:00:00.000Z' }),
        ],
        false,
      ),
    } as never);
    await nexus.loadInitial('c1');

    expect(nexus.getChannelAuthorIds('c1').sort()).toEqual(['u1', 'u2']);
    expect(nexus.getChannelAuthorIds('other')).toEqual([]);
  });

  it('falls back gracefully on legacy bare-entity persisted payloads', () => {
    const persistence = createMemoryPersistence();
    const legacy = {
      m1: { data: bundle({ id: 'm1' }), partial: false, cachedAt: Date.now() },
    };
    persistence.set('haven:nexus:community-messages:s1', JSON.stringify(legacy));

    const restored = new CommunityMessageNexus('s1', persistence);
    restored.rehydrate();
    expect(restored.getSnapshot('m1')).toBeDefined();
  });

  it('loadInitial overwrites cached messages with freshly fetched data', async () => {
    const nexus = new CommunityMessageNexus('s1', createMemoryPersistence());
    let call = 0;
    const listChannelMessages = vi.fn(async () => {
      call += 1;
      return {
        messages: [bundle({ id: 'm1', content: call === 1 ? 'stale' : 'fresh' })],
        hasMore: false,
      };
    });
    nexus.setCommunityData({ listChannelMessages } as never);

    await nexus.loadInitial('c1');
    expect(nexus.getSnapshot('m1')?.content).toBe('stale');
    // A second fetch must replace the cached entity (re-signed URLs, edits, ...),
    // not be skipped because the id already exists.
    await nexus.loadInitial('c1');
    expect(nexus.getSnapshot('m1')?.content).toBe('fresh');
  });

  it('persist() nulls ephemeral signed media URLs', async () => {
    const persistence = createMemoryPersistence();
    const source = new CommunityMessageNexus('s1', persistence);
    const withMedia = bundle({
      id: 'm1',
      attachment: {
        id: 'a1',
        messageId: 'm1',
        communityId: 's1',
        channelId: 'c1',
        ownerUserId: 'u1',
        bucketName: 'message-media',
        objectPath: 'path/a1.jpg',
        originalFilename: 'a1.jpg',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        sizeBytes: 1234,
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-02-01T00:00:00.000Z',
        signedUrl: 'https://signed.example/a1.jpg?token=abc',
      },
    });
    source.setCommunityData({
      listChannelMessages: loadPage([withMedia], false),
    } as never);
    await source.loadInitial('c1');
    // In-memory copy keeps the live signed URL for immediate rendering...
    expect(source.getSnapshot('m1')?.attachment?.signedUrl).toBe(
      'https://signed.example/a1.jpg?token=abc',
    );

    // ...but the persisted/rehydrated copy must not carry the dead URL.
    const restored = new CommunityMessageNexus('s1', persistence);
    restored.rehydrate();
    expect(restored.getSnapshot('m1')?.attachment).not.toBeNull();
    expect(restored.getSnapshot('m1')?.attachment?.signedUrl).toBeNull();
  });
});
