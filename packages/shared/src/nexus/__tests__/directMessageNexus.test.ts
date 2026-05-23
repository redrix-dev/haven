import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { DirectMessageNexus } from '@shared/nexus/direct-messages/DirectMessageNexus';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from '@shared/lib/backend/types';

const conversation = (
  overrides: Partial<DirectMessageConversationSummary> = {},
): DirectMessageConversationSummary => ({
  conversationId: 'dm1',
  kind: 'direct',
  otherUserId: 'u2',
  otherUsername: 'bob',
  otherAvatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: null,
  lastMessageId: null,
  lastMessageAuthorUserId: null,
  lastMessagePreview: null,
  lastMessageCreatedAt: null,
  unreadCount: 0,
  isMuted: false,
  mutedUntil: null,
  ...overrides,
});

const message = (overrides: Partial<DirectMessage> = {}): DirectMessage => ({
  messageId: 'm1',
  attachments: [],
  conversationId: 'dm1',
  authorUserId: 'u1',
  authorUsername: 'alice',
  authorAvatarUrl: null,
  content: 'hello',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  ...overrides,
});

describe('DirectMessageNexus', () => {
  it('loads conversations and dedupes concurrent calls', async () => {
    const listConversations = vi.fn(async () => [conversation()]);
    const nexus = new DirectMessageNexus(createMemoryPersistence(), { listConversations } as never);

    await Promise.all([nexus.loadConversations(), nexus.loadConversations()]);

    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(nexus.getSnapshot('dm1')).toBeDefined();
  });

  it('can load conversations without toggling the loading state', async () => {
    let resolveList: (value: DirectMessageConversationSummary[]) => void = () => {};
    const listConversations = vi.fn(
      () =>
        new Promise<DirectMessageConversationSummary[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const nexus = new DirectMessageNexus(createMemoryPersistence(), { listConversations } as never);

    const promise = nexus.loadConversations({ suppressLoadingState: true });

    expect(nexus.getReactiveStore().getState().isLoadingConversations).toBe(false);
    resolveList([conversation()]);
    await promise;

    expect(nexus.getSnapshot('dm1')).toBeDefined();
    expect(nexus.getReactiveStore().getState().isLoadingConversations).toBe(false);
  });

  it('loadMessages reverses the response into ascending order', async () => {
    const desc = [
      message({ messageId: 'm2', createdAt: '2026-01-01T00:00:01.000Z' }),
      message({ messageId: 'm1', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const nexus = new DirectMessageNexus(createMemoryPersistence(), { listMessages: vi.fn(async () => desc) } as never);

    await nexus.loadMessages('dm1');

    const state = nexus.getReactiveStore().getState();
    expect(state.messagesByConversation['dm1']).toEqual(['m1', 'm2']);
  });

  it('upsertMessage adds a new entry to its conversation', () => {
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {} as never);
    nexus.upsertMessage(message({ messageId: 'm10' }));

    const state = nexus.getReactiveStore().getState();
    expect(state.messagesByConversation['dm1']).toEqual(['m10']);
    expect(state.messageEntities['m10']?.content).toBe('hello');
  });

  it('markRead resets unreadCount in the cached conversation', async () => {
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {
      markConversationRead: vi.fn(async () => true),
    } as never);
    nexus.setConversations([conversation({ unreadCount: 5 })]);

    await nexus.markRead('dm1');

    expect(nexus.getSnapshot('dm1')?.unreadCount).toBe(0);
  });
});
