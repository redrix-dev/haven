import { describe, expect, it } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createMemoryPersistence } from '@shared/core';
import { DirectMessageNexus } from '@shared/nexus/direct-messages/DirectMessageNexus';
import {
  createDmConversations,
  createDmMessages,
} from '@solid-bindings';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from '@shared/lib/backend/types';

const conversation = (
  conversationId: string,
): DirectMessageConversationSummary => ({
  conversationId,
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
});

const message = (
  messageId: string,
  conversationId: string,
): DirectMessage => ({
  messageId,
  attachments: [],
  conversationId,
  authorUserId: 'u1',
  authorUsername: 'alice',
  authorAvatarUrl: null,
  content: 'hello',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  editedAt: null,
  deletedAt: null,
});

describe('DirectMessageNexus → @solid-bindings', () => {
  it('createDmConversations reacts to setConversations', () => {
    createRoot((dispose) => {
      const nexus = new DirectMessageNexus(createMemoryPersistence(), {} as never);
      const convos = createDmConversations(nexus);

      expect(convos()).toEqual([]);
      nexus.setConversations([conversation('dm1'), conversation('dm2')]);
      expect(convos().map((c) => c.conversationId).sort()).toEqual(['dm1', 'dm2']);

      dispose();
    });
  });

  it('createDmMessages tracks the conversation-id getter at access time', () => {
    createRoot((dispose) => {
      const nexus = new DirectMessageNexus(createMemoryPersistence(), {} as never);
      nexus.upsertMessage(message('m1', 'dm1'));

      const [conversationId, setConversationId] = createSignal('dm1');
      const messages = createDmMessages(nexus, conversationId);

      expect(messages().map((m) => m.messageId)).toEqual(['m1']);

      setConversationId('dm2');
      expect(messages()).toEqual([]);

      dispose();
    });
  });
});
