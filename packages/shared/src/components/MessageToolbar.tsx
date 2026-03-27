import React from 'react';
import { Button } from '@shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import { cn } from '@shared/lib/utils';

type ShortcutEvent = Pick<
  React.KeyboardEvent<HTMLTextAreaElement>,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'preventDefault'
>;

export interface MessageToolbarHandle {
  handleKeyboardShortcut: (event: ShortcutEvent) => boolean;
}

interface MessageToolbarProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  variant?: 'toolbar' | 'menu';
  triggerClassName?: string;
  triggerLabel?: React.ReactNode;
  triggerTitle?: string;
  menuAlign?: 'start' | 'center' | 'end';
}

const toolbarButtonClassName =
  'h-7 min-w-7 rounded-md px-2 text-xs font-semibold text-[#cfe0ff] hover:bg-[#22334f] hover:text-white';
const menuItemClassName = 'cursor-pointer text-[#d8e5f7] focus:bg-[#22334f] focus:text-white';
const menuShortcutClassName = 'text-[#8ea4c7]';

const scheduleSelection = (
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  start: number,
  end: number
) => {
  window.requestAnimationFrame(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(start, end);
  });
};

export const MessageToolbar = React.forwardRef<MessageToolbarHandle, MessageToolbarProps>(
  function MessageToolbar(
    {
      inputRef,
      value,
      onChange,
      variant = 'toolbar',
      triggerClassName,
      triggerLabel = '...',
      triggerTitle = 'Formatting options',
      menuAlign = 'end',
    },
    ref
  ) {
    const commitChange = React.useCallback(
      (nextValue: string, selectionStart: number, selectionEnd: number) => {
        onChange(nextValue);
        scheduleSelection(inputRef, selectionStart, selectionEnd);
      },
      [inputRef, onChange]
    );

    const withSelection = React.useCallback(
      (apply: (input: HTMLTextAreaElement, start: number, end: number) => void) => {
        const input = inputRef.current;
        if (!input) return false;
        const start = input.selectionStart ?? value.length;
        const end = input.selectionEnd ?? start;
        apply(input, start, end);
        return true;
      },
      [inputRef, value.length]
    );

    const applyWrappedFormat = React.useCallback(
      (open: string, close = open) => {
        withSelection((_input, start, end) => {
          const selected = value.slice(start, end);
          const before = value.slice(0, start);
          const after = value.slice(end);
          const nextValue = `${before}${open}${selected}${close}${after}`;
          const nextSelectionStart = start + open.length;
          const nextSelectionEnd = selected
            ? nextSelectionStart + selected.length
            : nextSelectionStart;
          commitChange(nextValue, nextSelectionStart, nextSelectionEnd);
        });
      },
      [commitChange, value, withSelection]
    );

    const prefixSelectedLines = React.useCallback(
      (formatter: (line: string, index: number) => string) => {
        withSelection((input, start, end) => {
          const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
          const nextLineBreak = value.indexOf('\n', end);
          const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
          const before = value.slice(0, lineStart);
          const selectedBlock = value.slice(lineStart, lineEnd);
          const after = value.slice(lineEnd);
          const transformed = selectedBlock
            .split('\n')
            .map((line, index) => formatter(line, index))
            .join('\n');
          const nextValue = `${before}${transformed}${after}`;
          const nextSelectionStart = lineStart;
          const nextSelectionEnd = lineStart + transformed.length;
          commitChange(nextValue, nextSelectionStart, nextSelectionEnd);
          input.focus();
        });
      },
      [commitChange, value, withSelection]
    );

    const insertCodeBlock = React.useCallback(() => {
      withSelection((input, start, end) => {
        const selected = value.slice(start, end);
        const before = value.slice(0, start);
        const after = value.slice(end);
        const open = '```\n';
        const close = '\n```';
        const nextValue = `${before}${open}${selected}${close}${after}`;
        const nextSelectionStart = start + open.length;
        const nextSelectionEnd = selected
          ? nextSelectionStart + selected.length
          : nextSelectionStart;
        commitChange(nextValue, nextSelectionStart, nextSelectionEnd);
        input.focus();
      });
    }, [commitChange, value, withSelection]);

    const insertLink = React.useCallback(() => {
      withSelection((input, start, end) => {
        const selected = value.slice(start, end);
        const before = value.slice(0, start);
        const after = value.slice(end);
        if (selected) {
          const nextValue = `${before}[${selected}](url)${after}`;
          const urlStart = start + selected.length + 3;
          commitChange(nextValue, urlStart, urlStart + 3);
          input.focus();
          return;
        }
        const nextValue = `${before}[](url)${after}`;
        const labelStart = start + 1;
        commitChange(nextValue, labelStart, labelStart);
        input.focus();
      });
    }, [commitChange, value, withSelection]);

    const insertHorizontalRule = React.useCallback(() => {
      withSelection((input, start, end) => {
        const before = value.slice(0, start);
        const after = value.slice(end);
        const insertion = '\n---\n';
        const nextValue = `${before}${insertion}${after}`;
        const cursor = start + insertion.length;
        commitChange(nextValue, cursor, cursor);
        input.focus();
      });
    }, [commitChange, value, withSelection]);

    const handleKeyboardShortcut = React.useCallback(
      (event: ShortcutEvent) => {
        const modifier = event.ctrlKey || event.metaKey;
        if (!modifier || event.altKey) return false;

        const key = event.key.toLowerCase();
        if (key === 'b') {
          event.preventDefault();
          applyWrappedFormat('**');
          return true;
        }
        if (key === 'i') {
          event.preventDefault();
          applyWrappedFormat('*');
          return true;
        }
        if (key === 'u') {
          event.preventDefault();
          applyWrappedFormat('__');
          return true;
        }

        return false;
      },
      [applyWrappedFormat]
    );

    React.useImperativeHandle(
      ref,
      () => ({
        handleKeyboardShortcut,
      }),
      [handleKeyboardShortcut]
    );

    const preventToolbarFocusLoss = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
    };

    const renderMenuContent = () => (
      <DropdownMenuContent
        align={menuAlign}
        className="w-56 border-[#304867] bg-[#18243a] text-white"
      >
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => applyWrappedFormat('**')}
        >
          Bold
          <DropdownMenuShortcut className={menuShortcutClassName}>Ctrl+B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={() => applyWrappedFormat('*')}>
          Italic
          <DropdownMenuShortcut className={menuShortcutClassName}>Ctrl+I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={() => applyWrappedFormat('__')}>
          Underline
          <DropdownMenuShortcut className={menuShortcutClassName}>Ctrl+U</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={() => applyWrappedFormat('~~')}>
          Strikethrough
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={() => applyWrappedFormat('`')}>
          Inline code
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={insertCodeBlock}>
          Code block
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={insertLink}>
          Link
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[#304867]" />
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line) => `> ${line}`)}
        >
          Blockquote
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line) => `# ${line}`)}
        >
          Heading 1
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line) => `## ${line}`)}
        >
          Heading 2
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line) => `### ${line}`)}
        >
          Heading 3
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line) => `- ${line}`)}
        >
          Bullet list
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => prefixSelectedLines((line, index) => `${index + 1}. ${line}`)}
        >
          Numbered list
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClassName} onSelect={insertHorizontalRule}>
          Horizontal rule
          <DropdownMenuShortcut className={menuShortcutClassName}>---</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );

    if (variant === 'menu') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-9 min-w-9 rounded-xl px-2 text-sm font-semibold text-[#cfe0ff] hover:bg-[#22334f] hover:text-white',
                triggerClassName
              )}
              title={triggerTitle}
              aria-label={triggerTitle}
              onMouseDown={preventToolbarFocusLoss}
            >
              {triggerLabel}
            </Button>
          </DropdownMenuTrigger>
          {renderMenuContent()}
        </DropdownMenu>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-[#304867] bg-[#111a2b] px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Bold (Ctrl+B)"
          aria-label="Bold"
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => applyWrappedFormat('**')}
        >
          B
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Italic (Ctrl+I)"
          aria-label="Italic"
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => applyWrappedFormat('*')}
        >
          I
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Underline (Ctrl+U)"
          aria-label="Underline"
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => applyWrappedFormat('__')}
        >
          U
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Strikethrough"
          aria-label="Strikethrough"
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => applyWrappedFormat('~~')}
        >
          S
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Inline code"
          aria-label="Inline code"
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => applyWrappedFormat('`')}
        >
          &lt;/&gt;
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Code block"
          aria-label="Code block"
          onMouseDown={preventToolbarFocusLoss}
          onClick={insertCodeBlock}
        >
          {'{ }'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={toolbarButtonClassName}
          title="Link"
          aria-label="Link"
          onMouseDown={preventToolbarFocusLoss}
          onClick={insertLink}
        >
          Link
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={toolbarButtonClassName}
              title={triggerTitle}
              aria-label={triggerTitle}
              onMouseDown={preventToolbarFocusLoss}
            >
              {triggerLabel}
            </Button>
          </DropdownMenuTrigger>
          {renderMenuContent()}
        </DropdownMenu>
      </div>
    );
  }
);

MessageToolbar.displayName = 'MessageToolbar';
