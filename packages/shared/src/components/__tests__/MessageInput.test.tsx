// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageInput } from '@shared/components/MessageInput';

describe('MessageInput', () => {
  it('wraps the current selection with toolbar formatting and keeps textarea composition behavior', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageInput
        onSendMessage={onSendMessage}
        channelId="channel-1"
        channelName="general"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    await user.type(textarea, 'hello');
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    await user.click(screen.getByRole('button', { name: /bold/i }));

    await waitFor(() => {
      expect(textarea.value).toBe('**hello**');
    });

    await user.type(textarea, '{End}{Shift>}{Enter}{/Shift}world');
    expect(textarea.value).toBe('**hello**\nworld');

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('**hello**\nworld', {
        replyToMessageId: undefined,
        mediaFile: undefined,
        mediaExpiresInHours: undefined,
      });
    });
  });
});
