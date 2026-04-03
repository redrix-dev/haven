import React from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { cn } from '@shared/lib/utils';

type MarkdownParent = {
  children?: MarkdownNode[];
};

type MarkdownPosition = {
  start?: { offset?: number | null };
  end?: { offset?: number | null };
};

type MarkdownNode = MarkdownParent & {
  type?: string;
  data?: Record<string, unknown>;
  position?: MarkdownPosition;
};

const walkMarkdownTree = (node: MarkdownNode, visit: (value: MarkdownNode) => void) => {
  visit(node);
  node.children?.forEach((child) => {
    walkMarkdownTree(child, visit);
  });
};

const createUnderlineRemarkPlugin = (source: string) => () => (tree: MarkdownNode) => {
  walkMarkdownTree(tree, (node) => {
    if (node.type !== 'strong') return;
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start !== 'number' || typeof end !== 'number') return;
    const raw = source.slice(start, end);
    if (!raw.startsWith('__') || !raw.endsWith('__')) return;
    node.data = {
      ...(node.data ?? {}),
      hName: 'u',
    };
  });
};

type CodeComponentProps = React.ComponentProps<'code'> &
  ExtraProps & {
    inline?: boolean;
  };

const markdownComponents: Components = {
  strong({ children, ...props }) {
    return (
      <strong className="font-semibold" {...props}>
        {children}
      </strong>
    );
  },
  em({ children, ...props }) {
    return (
      <em className="italic" {...props}>
        {children}
      </em>
    );
  },
  u({ children, ...props }) {
    return (
      <u className="underline" {...props}>
        {children}
      </u>
    );
  },
  del({ children, ...props }) {
    return (
      <del className="line-through opacity-70" {...props}>
        {children}
      </del>
    );
  },
  code(props) {
    const { children, inline, ...rest } = props as CodeComponentProps;
    if (inline) {
      return (
        <code
          className="rounded px-1 py-0.5 text-[0.85em] font-mono bg-white/10 text-gray-200"
          {...rest}
        >
          {children}
        </code>
      );
    }

    return (
      <code className="text-[0.8em] font-mono text-gray-200 whitespace-pre" {...rest}>
        {children}
      </code>
    );
  },
  pre({ children, ...props }) {
    return (
      <pre
        className="my-1.5 rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 overflow-x-auto"
        {...props}
      >
        {children}
      </pre>
    );
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="my-1 border-l-2 border-gray-500 pl-3 text-gray-400 italic"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  a({ children, href, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-blue-400 hover:text-blue-300 break-all"
        {...props}
      >
        {children}
      </a>
    );
  },
  p({ children, ...props }) {
    return (
      <p className="break-words leading-relaxed" {...props}>
        {children}
      </p>
    );
  },
  h1({ children, ...props }) {
    return (
      <h1 className="text-xl font-bold mt-2 mb-1" {...props}>
        {children}
      </h1>
    );
  },
  h2({ children, ...props }) {
    return (
      <h2 className="text-lg font-bold mt-2 mb-1" {...props}>
        {children}
      </h2>
    );
  },
  h3({ children, ...props }) {
    return (
      <h3 className="text-base font-bold mt-1 mb-1" {...props}>
        {children}
      </h3>
    );
  },
  ul({ children, ...props }) {
    return (
      <ul className="list-disc list-inside my-1 space-y-0.5" {...props}>
        {children}
      </ul>
    );
  },
  ol({ children, ...props }) {
    return (
      <ol className="list-decimal list-inside my-1 space-y-0.5" {...props}>
        {children}
      </ol>
    );
  },
  li({ children, ...props }) {
    return (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    );
  },
  hr(props) {
    return <hr className="my-2 border-white/20" {...props} />;
  },
  table({ children, ...props }) {
    return (
      <table className="my-2 text-sm border-collapse" {...props}>
        {children}
      </table>
    );
  },
  th({ children, ...props }) {
    return (
      <th className="border border-white/20 px-2 py-1 font-semibold bg-white/5" {...props}>
        {children}
      </th>
    );
  },
  td({ children, ...props }) {
    return (
      <td className="border border-white/20 px-2 py-1" {...props}>
        {children}
      </td>
    );
  },
};

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export const MarkdownText = React.memo(function MarkdownText({
  content,
  className,
}: MarkdownTextProps) {
  const remarkPlugins = React.useMemo(
    () => [remarkGfm, remarkBreaks, createUnderlineRemarkPlugin(content)],
    [content]
  );

  return (
    <span className={cn('break-words leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </span>
  );
});

// CHECKPOINT 2 COMPLETE
