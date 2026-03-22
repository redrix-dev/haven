// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DirectMessageArea } from '@shared/components/DirectMessageArea';
import { useDmStore } from '@shared/stores/dmStore';
import type { DirectMessage, DirectMessageConversationSummary } from '@shared/lib/backend/types';

const conversation: DirectMessageConversationSummary = {
  conversationId: 'conv-1',
  kind: 'direct',
  otherUserId: 'user-2',
  otherUsername: 'FriendUser',
  otherAvatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastMessageAt: null,
  lastMessageId: null,
  lastMessageAuthorUserId: null,
  lastMessagePreview: null,
  lastMessageCreatedAt: null,
  unreadCount: 0,
  isMuted: false,
  mutedUntil: null,
};

function renderArea(overrides?: Partial<React.ComponentProps<typeof DirectMessageArea>>) {
  useDmStore.getState().setCurrentConversation(conversation);
  useDmStore.getState().setCurrentConversationId(conversation.conversationId);
  return render(
    <DirectMessageArea
      currentUserId="user-1"
      currentUserDisplayName="Me"
      messages={[]}
      loading={false}
      sending={false}
      error={null}
      onRefresh={() => {}}
      onSendMessage={async () => {}}
      onToggleMute={async () => {}}
      onBlockUser={async () => {}}
      onReportMessage={async () => {}}
      {...overrides}
    />
  );
}

describe('DirectMessageArea', () => {
  it('renders explicit blocked/unfriended style error hint', () => {
    renderArea({
      error: 'Direct messages are not available for this user because they are not on your friends list.',
    });

    expect(screen.getByText(/friends-only right now/i)).toBeTruthy();
  });

  it('invokes block handler when confirmed', async () => {
    const user = userEvent.setup();
    const onBlockUser = vi.fn().mockResolvedValue(undefined);

    renderArea({ onBlockUser });

    await user.click(screen.getByRole('button', { name: /^block$/i }));
    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /^block$/i }));

    expect(onBlockUser).toHaveBeenCalledWith({
      userId: 'user-2',
      username: 'FriendUser',
    });
  });

  it('renders image attachments and hides placeholder-only text', () => {
    const messages: DirectMessage[] = [
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        authorUserId: 'user-2',
        authorUsername: 'FriendUser',
        authorAvatarUrl: null,
        content: '\u200B',
        metadata: {},
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        attachments: [
          {
            id: 'att-1',
            messageId: 'msg-1',
            conversationId: 'conv-1',
            ownerUserId: 'user-2',
            bucketName: 'dm-message-media',
            objectPath: 'conv-1/test-image.png',
            originalFilename: 'test-image.png',
            mimeType: 'image/png',
            mediaKind: 'image',
            sizeBytes: 123,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            signedUrl: 'https://example.com/test-image.png',
          },
        ],
      },
    ];

    renderArea({ messages });

    expect(screen.queryByText('\u200B')).toBeNull();
    expect(screen.getByAltText('test-image.png')).toBeTruthy();
  });
});
