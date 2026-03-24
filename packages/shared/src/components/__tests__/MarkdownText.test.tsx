// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '@shared/lib/markdownRenderer';

describe('MarkdownText', () => {
  it('renders underline, links, tables, and code with the expected markdown-lite styling', () => {
    render(
      <MarkdownText
        content={[
          '__under__ **bold** *italic* ~~strike~~ `code` https://example.com',
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
});
