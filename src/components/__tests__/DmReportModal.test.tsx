// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DmReportModal } from '@/components/DmReportModal';

describe('DmReportModal', () => {
  it('validates required comment before submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <DmReportModal
        open
        onOpenChange={() => {}}
        target={{
          messageId: 'msg-1',
          authorUsername: 'ReporterTarget',
          messagePreview: 'hello',
        }}
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    expect(screen.getByText(/please add a brief reason/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits and shows success state when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <DmReportModal
        open
        onOpenChange={() => {}}
        target={{
          messageId: 'msg-2',
          authorUsername: 'TargetUser',
          messagePreview: 'A suspicious DM',
        }}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText(/reason/i), 'Automated test report reason');
    await user.click(screen.getByRole('button', { name: /submit report/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      messageId: 'msg-2',
      kind: 'content_abuse',
      comment: 'Automated test report reason',
    });

    expect(await screen.findByText(/report submitted/i)).toBeTruthy();
  });
});
