// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectMessageArea } from '@/components/DirectMessageArea';
import type { DirectMessageConversationSummary } from '@/lib/backend/types';

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
  return render(
    <DirectMessageArea
      currentUserId="user-1"
      currentUserDisplayName="Me"
      conversation={conversation}
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
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderArea({ onBlockUser });

    await user.click(screen.getByRole('button', { name: /^block$/i }));

    expect(onBlockUser).toHaveBeenCalledWith({
      userId: 'user-2',
      username: 'FriendUser',
    });

    confirmSpy.mockRestore();
  });
});
