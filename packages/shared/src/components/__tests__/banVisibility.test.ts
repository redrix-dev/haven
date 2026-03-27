import { describe, expect, it } from 'vitest';
import {
  BANNED_REPLY_PLACEHOLDER_CONTENT,
  applyChannelAccessVisibilityToMessageBundle,
  filterHiddenMessageContent,
  filterBlockedUserContent,
  isModerationRemovedReplyPlaceholder,
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
  metadata: Record<string, unknown> | null = null,
  channelId = 'channel-1',
  isHidden = false
) =>
  ({
    id,
    community_id: 'server-1',
    channel_id: channelId,
    author_user_id: authorUserId,
    author_type: 'user',
    content,
    metadata,
    created_at: nowIso,
    deleted_at: null,
    edited_at: null,
    is_hidden: isHidden,
  }) as unknown as Message;

const makeReaction = (id: string, messageId: string, userId: string): MessageReaction => ({
  id,
  messageId,
  userId,
  emoji: '👍',
  createdAt: nowIso,
});

const makeAttachment = (
  id: string,
  messageId: string,
  ownerUserId: string,
  channelId = 'channel-1'
): MessageAttachment => ({
  id,
  messageId,
  communityId: 'server-1',
  channelId,
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

const makeLinkPreview = (id: string, messageId: string, channelId = 'channel-1'): MessageLinkPreview => ({
  id,
  messageId,
  communityId: 'server-1',
  channelId,
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

describe('banVisibility', () => {
  it('filters channel access revocation content only in the targeted channel', () => {
    const revokedRoot = makeMessage('revoked-root', 'revoked-user', 'Hidden root');
    const revokedReply = makeMessage(
      'revoked-reply',
      'revoked-user',
      'Hidden reply',
      { replyToMessageId: 'visible-root' }
    );
    const visibleRoot = makeMessage('visible-root', 'user-1', 'Visible root');
    const otherChannelMessage = makeMessage(
      'other-channel',
      'revoked-user',
      'Still visible elsewhere',
      null,
      'channel-2'
    );

    const filtered = applyChannelAccessVisibilityToMessageBundle(
      {
        messages: [revokedRoot, visibleRoot, revokedReply, otherChannelMessage],
        reactions: [
          makeReaction('reaction-1', 'revoked-reply', 'user-2'),
          makeReaction('reaction-2', 'other-channel', 'revoked-user'),
        ],
        attachments: [
          makeAttachment('attachment-1', 'revoked-reply', 'revoked-user'),
          makeAttachment('attachment-2', 'other-channel', 'revoked-user', 'channel-2'),
        ],
        linkPreviews: [
          makeLinkPreview('preview-1', 'revoked-reply'),
          makeLinkPreview('preview-2', 'other-channel', 'channel-2'),
        ],
      },
      {
        channelId: 'channel-1',
        revokedUserIds: ['revoked-user'],
      }
    );

    const placeholderReply = filtered.messages.find((message) => message.id === 'revoked-reply');

    expect(filtered.messages.map((message) => message.id)).toEqual([
      'visible-root',
      'revoked-reply',
      'other-channel',
    ]);
    expect(placeholderReply?.content).toBe(BANNED_REPLY_PLACEHOLDER_CONTENT);
    expect(isModerationRemovedReplyPlaceholder(placeholderReply as Message)).toBe(true);
    expect(filtered.reactions.map((reaction) => reaction.id)).toEqual(['reaction-2']);
    expect(filtered.attachments.map((attachment) => attachment.id)).toEqual(['attachment-2']);
    expect(filtered.linkPreviews.map((preview) => preview.id)).toEqual(['preview-2']);
  });

  it('hides blocked user content without placeholders and removes descendant replies', () => {
    const visibleRoot = makeMessage('visible-root', 'user-1', 'Visible root');
    const blockedThreadRoot = makeMessage('blocked-root', 'blocked-user', 'Blocked root');
    const blockedThreadReply = makeMessage('blocked-thread-reply', 'user-2', 'Reply in blocked thread', {
      replyToMessageId: 'blocked-root',
    });
    const blockedReply = makeMessage('blocked-reply', 'blocked-user', 'Blocked reply', {
      replyToMessageId: 'visible-root',
    });
    const visibleReply = makeMessage('visible-reply', 'user-3', 'Visible reply', {
      replyToMessageId: 'visible-root',
    });

    const filtered = filterBlockedUserContent(
      {
        messages: [visibleRoot, blockedThreadRoot, blockedThreadReply, blockedReply, visibleReply],
        reactions: [
          makeReaction('reaction-1', 'blocked-reply', 'user-4'),
          makeReaction('reaction-2', 'visible-reply', 'blocked-user'),
          makeReaction('reaction-3', 'visible-reply', 'user-4'),
        ],
        attachments: [
          makeAttachment('attachment-1', 'blocked-reply', 'blocked-user'),
          makeAttachment('attachment-2', 'visible-reply', 'user-3'),
        ],
        linkPreviews: [makeLinkPreview('preview-1', 'blocked-reply'), makeLinkPreview('preview-2', 'visible-reply')],
      },
      new Set(['blocked-user']),
      false
    );

    expect(filtered.messages.map((message) => message.id)).toEqual(['visible-root', 'visible-reply']);
    expect(filtered.messages.some((message) => message.content === BANNED_REPLY_PLACEHOLDER_CONTENT)).toBe(false);
    expect(filtered.reactions.map((reaction) => reaction.id)).toEqual(['reaction-3']);
    expect(filtered.attachments.map((attachment) => attachment.id)).toEqual(['attachment-2']);
    expect(filtered.linkPreviews.map((preview) => preview.id)).toEqual(['preview-2']);
  });

  it('leaves blocked user content visible for elevated viewers', () => {
    const blockedMessage = makeMessage('blocked-root', 'blocked-user', 'Blocked root');

    const filtered = filterBlockedUserContent(
      {
        messages: [blockedMessage],
        reactions: [makeReaction('reaction-1', 'blocked-root', 'blocked-user')],
        attachments: [makeAttachment('attachment-1', 'blocked-root', 'blocked-user')],
        linkPreviews: [makeLinkPreview('preview-1', 'blocked-root')],
      },
      new Set(['blocked-user']),
      true
    );

    expect(filtered.messages).toHaveLength(1);
    expect(filtered.reactions).toHaveLength(1);
    expect(filtered.attachments).toHaveLength(1);
    expect(filtered.linkPreviews).toHaveLength(1);
  });

  it('filters hidden messages and their child records when hidden messages are toggled off', () => {
    const visibleMessage = makeMessage('visible-root', 'user-1', 'Visible root');
    const hiddenMessage = makeMessage(
      'hidden-root',
      'user-2',
      'Hidden root',
      null,
      'channel-1',
      true
    );

    const filtered = filterHiddenMessageContent(
      {
        messages: [visibleMessage, hiddenMessage],
        reactions: [
          makeReaction('reaction-1', 'hidden-root', 'user-3'),
          makeReaction('reaction-2', 'visible-root', 'user-4'),
        ],
        attachments: [
          makeAttachment('attachment-1', 'hidden-root', 'user-2'),
          makeAttachment('attachment-2', 'visible-root', 'user-1'),
        ],
        linkPreviews: [
          makeLinkPreview('preview-1', 'hidden-root'),
          makeLinkPreview('preview-2', 'visible-root'),
        ],
      },
      false
    );

    expect(filtered.messages.map((message) => message.id)).toEqual(['visible-root']);
    expect(filtered.reactions.map((reaction) => reaction.id)).toEqual(['reaction-2']);
    expect(filtered.attachments.map((attachment) => attachment.id)).toEqual(['attachment-2']);
    expect(filtered.linkPreviews.map((preview) => preview.id)).toEqual(['preview-2']);
  });

  it('keeps hidden messages visible when the session toggle is on', () => {
    const hiddenMessage = makeMessage(
      'hidden-root',
      'user-2',
      'Hidden root',
      null,
      'channel-1',
      true
    );

    const filtered = filterHiddenMessageContent(
      {
        messages: [hiddenMessage],
        reactions: [makeReaction('reaction-1', 'hidden-root', 'user-3')],
        attachments: [makeAttachment('attachment-1', 'hidden-root', 'user-2')],
        linkPreviews: [makeLinkPreview('preview-1', 'hidden-root')],
      },
      true
    );

    expect(filtered.messages).toHaveLength(1);
    expect(filtered.reactions).toHaveLength(1);
    expect(filtered.attachments).toHaveLength(1);
    expect(filtered.linkPreviews).toHaveLength(1);
  });
});
