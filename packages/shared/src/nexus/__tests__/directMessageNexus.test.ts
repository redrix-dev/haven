import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import {
  conversationsEqual,
  DirectMessageNexus,
} from '@shared/nexus/direct-messages/DirectMessageNexus';
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

  it('upsertMessage keeps the conversation sorted oldest-first', () => {
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {} as never);

    nexus.upsertMessage(message({ messageId: 'm1', createdAt: '2026-01-01T00:00:00.000Z' }));
    nexus.upsertMessage(message({ messageId: 'm3', createdAt: '2026-01-01T00:00:03.000Z' }));
    nexus.upsertMessage(message({ messageId: 'm2', createdAt: '2026-01-01T00:00:02.000Z' }));

    const state = nexus.getReactiveStore().getState();
    expect(state.messagesByConversation['dm1']).toEqual(['m1', 'm2', 'm3']);
  });

  it('receiveMessage hydrates the exact realtime message by id', async () => {
    const getMessage = vi.fn(async () =>
      message({ messageId: 'm42', content: 'hydrated' }),
    );
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {
      getMessage,
      listConversations: vi.fn(async () => []),
    } as never);

    await nexus.receiveMessage('dm1', 'm42');

    expect(getMessage).toHaveBeenCalledWith({ conversationId: 'dm1', messageId: 'm42' });
    expect(nexus.getReactiveStore().getState().messageEntities['m42']?.content).toBe('hydrated');
  });

  it('sendMessage updates the cached inbox summary without reloading conversations', async () => {
    const sent = message({
      messageId: 'm-new',
      content: 'latest body',
      createdAt: '2026-01-01T00:10:00.000Z',
    });
    const sendMessage = vi.fn(async () => sent);
    const listConversations = vi.fn(async () => []);
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {
      sendMessage,
      listConversations,
    } as never);

    nexus.setConversations([
      conversation({
        conversationId: 'dm2',
        otherUserId: 'u3',
        lastMessageAt: '2026-01-01T00:05:00.000Z',
        lastMessageCreatedAt: '2026-01-01T00:05:00.000Z',
        lastMessageId: 'm-dm2',
        lastMessagePreview: 'other thread',
      }),
      conversation({
        conversationId: 'dm1',
        lastMessageAt: '2026-01-01T00:00:00.000Z',
        lastMessageCreatedAt: '2026-01-01T00:00:00.000Z',
        lastMessageId: 'm-old',
        lastMessagePreview: 'old body',
        unreadCount: 4,
      }),
    ]);

    await nexus.sendMessage('dm1', 'latest body');

    const state = nexus.getReactiveStore().getState();
    const updated = state.entities['dm1']?.data;
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: 'dm1',
      content: 'latest body',
      metadata: undefined,
      imageUpload: undefined,
    });
    expect(listConversations).not.toHaveBeenCalled();
    expect(state.conversationIds[0]).toBe('dm1');
    expect(updated?.lastMessageId).toBe('m-new');
    expect(updated?.lastMessagePreview).toBe('latest body');
    expect(updated?.lastMessageAuthorUserId).toBe('u1');
    expect(updated?.unreadCount).toBe(0);
  });

  it('receiveMessage updates the cached inbox summary and unread count', async () => {
    const incoming = message({
      messageId: 'm-incoming',
      authorUserId: 'u2',
      authorUsername: 'bob',
      content: 'new from bob',
      createdAt: '2026-01-01T00:10:00.000Z',
    });
    const getMessage = vi.fn(async () => incoming);
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {
      getMessage,
    } as never);

    nexus.setConversations([
      conversation({
        conversationId: 'dm1',
        lastMessageAt: '2026-01-01T00:00:00.000Z',
        lastMessageCreatedAt: '2026-01-01T00:00:00.000Z',
        lastMessageId: 'm-old',
        unreadCount: 1,
      }),
    ]);

    await nexus.receiveMessage('dm1', 'm-incoming');

    const updated = nexus.getReactiveStore().getState().entities['dm1']?.data;
    expect(updated?.lastMessageId).toBe('m-incoming');
    expect(updated?.lastMessagePreview).toBe('new from bob');
    expect(updated?.unreadCount).toBe(2);
  });

  it('setConversations does not let a stale reload overwrite a newer local latest message', () => {
    const nexus = new DirectMessageNexus(createMemoryPersistence(), {} as never);
    nexus.setConversations([
      conversation({
        lastMessageAt: '2026-01-01T00:10:00.000Z',
        lastMessageCreatedAt: '2026-01-01T00:10:00.000Z',
        lastMessageId: 'm-new',
        lastMessagePreview: 'local new',
      }),
    ]);

    nexus.setConversations([
      conversation({
        lastMessageAt: '2026-01-01T00:00:00.000Z',
        lastMessageCreatedAt: '2026-01-01T00:00:00.000Z',
        lastMessageId: 'm-old',
        lastMessagePreview: 'server old',
      }),
    ]);

    const updated = nexus.getReactiveStore().getState().entities['dm1']?.data;
    expect(updated?.lastMessageId).toBe('m-new');
    expect(updated?.lastMessagePreview).toBe('local new');
  });

  it('conversationsEqual detects inbox row field changes', () => {
    expect(
      conversationsEqual(
        [conversation({ lastMessagePreview: 'before' })],
        [conversation({ lastMessagePreview: 'after' })],
      ),
    ).toBe(false);
    expect(
      conversationsEqual(
        [conversation({ isMuted: false })],
        [conversation({ isMuted: true })],
      ),
    ).toBe(false);
    expect(
      conversationsEqual(
        [conversation({ otherAvatarUrl: 'https://example.com/before.webp' })],
        [conversation({ otherAvatarUrl: 'https://example.com/after.webp' })],
      ),
    ).toBe(false);
    expect(
      conversationsEqual(
        [conversation({ otherUsername: 'bob' })],
        [conversation({ otherUsername: 'robert' })],
      ),
    ).toBe(false);
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
