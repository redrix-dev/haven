import { describe, expect, it } from 'vitest';
import {
  BANNED_REPLY_PLACEHOLDER_CONTENT,
  applyBanVisibilityToMessageBundle,
  isBanRemovedReplyPlaceholder,
} from '@client/features/messages/lib/banVisibility';
import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from '@shared/lib/backend/types';

const nowIso = '2026-03-22T12:00:00.000Z';

const makeMessage = (
  id: string,
  authorUserId: string,
  content: string,
  metadata: Record<string, unknown> | null = null
) =>
  ({
    id,
    community_id: 'server-1',
    channel_id: 'channel-1',
    author_user_id: authorUserId,
    author_type: 'user',
    content,
    metadata,
    created_at: nowIso,
    deleted_at: null,
    edited_at: null,
  }) as unknown as Message;

const makeReaction = (id: string, messageId: string, userId: string): MessageReaction => ({
  id,
  messageId,
  userId,
  emoji: '👍',
  createdAt: nowIso,
});

const makeAttachment = (id: string, messageId: string, ownerUserId: string): MessageAttachment => ({
  id,
  messageId,
  communityId: 'server-1',
  channelId: 'channel-1',
  ownerUserId,
  bucketName: 'message-media',
  objectPath: `attachments/${id}`,
  originalFilename: `${id}.png`,
  mimeType: 'image/png',
  mediaKind: 'image',
  sizeBytes: 128,
  createdAt: nowIso,
  expiresAt: nowIso,
  signedUrl: null,
});

const makeLinkPreview = (id: string, messageId: string): MessageLinkPreview => ({
  id,
  messageId,
  communityId: 'server-1',
  channelId: 'channel-1',
  sourceUrl: 'https://haven.test',
  normalizedUrl: 'https://haven.test',
  status: 'ready',
  cacheId: null,
  snapshot: null,
  embedProvider: 'none',
  thumbnailBucketName: null,
  thumbnailObjectPath: null,
  createdAt: nowIso,
  updatedAt: nowIso,
});

describe('applyBanVisibilityToMessageBundle', () => {
  it('removes a banned thread owner and all replies in that thread', () => {
    const root = makeMessage('root', 'banned-user', 'Root');
    const reply = makeMessage('reply', 'user-2', 'Reply', { replyToMessageId: 'root' });
    const unrelated = makeMessage('other', 'user-3', 'Other');

    const filtered = applyBanVisibilityToMessageBundle(
      {
        messages: [root, reply, unrelated],
        reactions: [makeReaction('reaction-1', 'reply', 'user-4')],
        attachments: [makeAttachment('attachment-1', 'reply', 'user-2')],
        linkPreviews: [makeLinkPreview('preview-1', 'reply')],
      },
      ['banned-user']
    );

    expect(filtered.messages.map((message) => message.id)).toEqual(['other']);
    expect(filtered.reactions).toHaveLength(0);
    expect(filtered.attachments).toHaveLength(0);
    expect(filtered.linkPreviews).toHaveLength(0);
  });

  it('keeps thread structure by replacing a banned reply with a placeholder', () => {
    const root = makeMessage('root', 'user-1', 'Root');
    const bannedReply = makeMessage('reply', 'banned-user', 'Sensitive reply', {
      replyToMessageId: 'root',
    });
    const descendant = makeMessage('descendant', 'user-2', 'Nested reply', {
      replyToMessageId: 'reply',
    });

    const filtered = applyBanVisibilityToMessageBundle(
      {
        messages: [root, bannedReply, descendant],
        reactions: [
          makeReaction('reaction-1', 'reply', 'user-3'),
          makeReaction('reaction-2', 'descendant', 'user-3'),
        ],
        attachments: [
          makeAttachment('attachment-1', 'reply', 'banned-user'),
          makeAttachment('attachment-2', 'descendant', 'user-2'),
        ],
        linkPreviews: [makeLinkPreview('preview-1', 'reply'), makeLinkPreview('preview-2', 'descendant')],
      },
      ['banned-user']
    );

    const placeholderReply = filtered.messages.find((message) => message.id === 'reply');

    expect(filtered.messages.map((message) => message.id)).toEqual(['root', 'reply', 'descendant']);
    expect(placeholderReply?.content).toBe(BANNED_REPLY_PLACEHOLDER_CONTENT);
    expect(isBanRemovedReplyPlaceholder(placeholderReply as Message)).toBe(true);
    expect(filtered.reactions.map((reaction) => reaction.id)).toEqual(['reaction-2']);
    expect(filtered.attachments.map((attachment) => attachment.id)).toEqual(['attachment-2']);
    expect(filtered.linkPreviews.map((preview) => preview.id)).toEqual(['preview-2']);
  });
});
