/**
 * markdownRenderer — lightweight Discord-style markdown renderer.
 *
 * Supports:
 *   **bold**            → <strong>
 *   *italic* _italic_   → <em>
 *   ~~strikethrough~~   → <del>
 *   `inline code`       → <code>
 *   ```code block```    → <pre><code>
 *   > blockquote        → <blockquote>
 *   URLs                → <a> (auto-linked)
 *
 * Returns React elements — no dangerouslySetInnerHTML.
 * Pure / memoizable: same input → same output.
 */
import React from 'react';

// ── Block parsing ─────────────────────────────────────────────────────────────

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'code_block'; code: string }
  | { kind: 'blockquote'; text: string };

function parseBlocks(input: string): Block[] {
  const lines = input.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — ``` or ~~~
    if (/^```|^~~~/.test(line)) {
      const fence = line.slice(0, 3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push({ kind: 'code_block', code: codeLines.join('\n') });
      continue;
    }

    // Blockquote — lines starting with >
    if (/^>[ \t]?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>[ \t]?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>[ \t]?/, ''));
        i++;
      }
      blocks.push({ kind: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // Paragraph — collect until a line that starts a different block type or is blank
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !/^```|^~~~/.test(lines[i]) &&
      !/^>[ \t]?/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const text = paraLines.join('\n');
    if (text.trim()) {
      blocks.push({ kind: 'paragraph', text });
    } else if (paraLines.length > 0) {
      // Preserve blank lines between blocks as an empty paragraph
      // (gives visual spacing, avoided for purely empty strings)
    }
    continue;
  }

  return blocks;
}

// ── Inline parsing ────────────────────────────────────────────────────────────

// Tokenise a plain-text segment into inline React nodes
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strike'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'url'; href: string; label: string };

const INLINE_RE = new RegExp(
  [
    '(`[^`]+`)',               // inline code
    '(\\*\\*[^*]+\\*\\*)',     // **bold**
    '(__[^_]+__)',              // __underline__ treated as bold-italic
    '(\\*[^*]+\\*)',           // *italic*
    '(_[^_]+_)',               // _italic_
    '(~~[^~]+~~)',             // ~~strike~~
    '(https?://[^\\s<>)"\']+)', // URL
  ].join('|'),
  'g'
);

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];

    if (raw.startsWith('`')) {
      segments.push({ kind: 'code', value: raw.slice(1, -1) });
    } else if (raw.startsWith('**')) {
      segments.push({ kind: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('__')) {
      segments.push({ kind: 'italic', value: raw.slice(2, -2) });
    } else if (raw.startsWith('*') || raw.startsWith('_')) {
      segments.push({ kind: 'italic', value: raw.slice(1, -1) });
    } else if (raw.startsWith('~~')) {
      segments.push({ kind: 'strike', value: raw.slice(2, -2) });
    } else if (raw.startsWith('http')) {
      segments.push({ kind: 'url', href: raw, label: raw });
    } else {
      segments.push({ kind: 'text', value: raw });
    }

    lastIndex = INLINE_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return parseInline(text).map((seg, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (seg.kind) {
      case 'bold':
        return <strong key={key} className="font-semibold">{seg.value}</strong>;
      case 'italic':
        return <em key={key} className="italic">{seg.value}</em>;
      case 'strike':
        return <del key={key} className="line-through opacity-70">{seg.value}</del>;
      case 'code':
        return (
          <code
            key={key}
            className="rounded px-1 py-0.5 text-[0.85em] font-mono bg-white/10 text-gray-200"
          >
            {seg.value}
          </code>
        );
      case 'url':
        return (
          <a
            key={key}
            href={seg.href}
            target="_blank"
            rel="noreferrer noopener"
            className="underline text-blue-400 hover:text-blue-300 break-all"
          >
            {seg.label}
          </a>
        );
      default:
        return <React.Fragment key={key}>{seg.value}</React.Fragment>;
    }
  });
}

// ── Block rendering ───────────────────────────────────────────────────────────

function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.kind) {
    case 'code_block':
      return (
        <pre
          key={idx}
          className="my-1.5 rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 overflow-x-auto"
        >
          <code className="text-[0.8em] font-mono text-gray-200 whitespace-pre">
            {block.code}
          </code>
        </pre>
      );

    case 'blockquote':
      return (
        <blockquote
          key={idx}
          className="my-1 border-l-2 border-gray-500 pl-3 text-gray-400 italic"
        >
          {renderInline(block.text, `bq-${idx}`)}
        </blockquote>
      );

    case 'paragraph':
    default: {
      // Preserve newlines within a paragraph as line breaks
      const lines = block.text.split('\n');
      const nodes: React.ReactNode[] = [];
      lines.forEach((line, li) => {
        nodes.push(...renderInline(line, `p-${idx}-${li}`));
        if (li < lines.length - 1) {
          nodes.push(<br key={`br-${idx}-${li}`} />);
        }
      });
      return <React.Fragment key={idx}>{nodes}</React.Fragment>;
    }
  }
}

// ── Public component ──────────────────────────────────────────────────────────

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export const MarkdownText = React.memo(function MarkdownText({
  content,
  className,
}: MarkdownTextProps) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);

  return (
    <span className={`break-words leading-relaxed ${className ?? ''}`}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </span>
  );
});
