// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '@shared/app/ui/MarkdownText';

describe('MarkdownText', () => {
  it('renders underline, links, tables, and code with the expected markdown-lite styling', () => {
    render(
      <MarkdownText
        content={[
          '_under_ **bold** *italic* ~~strike~~ `code` https://example.com',
          '',
          '> quote',
          '',
          '```',
          'const value = 1;',
          '```',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| Alpha | Beta |',
        ].join('\n')}
      />
    );

    expect(screen.getByText('under').tagName).toBe('U');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('strike').tagName).toBe('DEL');
    expect(screen.getByText('code').tagName).toBe('CODE');

    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');

    expect(screen.getByText('quote').closest('blockquote')).toBeTruthy();
    expect(screen.getByText('const value = 1;').closest('pre')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('renders Discord-style spoilers as reveal controls', async () => {
    const user = userEvent.setup();
    render(<MarkdownText content="||spoiler||" />);

    const spoiler = screen.getByRole('button', { name: /spoiler, click to reveal/i });
    expect(spoiler.getAttribute('aria-pressed')).toBe('false');

    await user.click(spoiler);
    expect(spoiler.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('spoiler')).toBeTruthy();
  });

  it('renders GFM task list items', () => {
    render(
      <MarkdownText
        content={['- [ ] Todo', '- [x] Done'].join('\n')}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });
});
