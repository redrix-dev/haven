import React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TurndownService from "turndown";
import { marked } from "marked";
import { cn } from "@shared/lib/utils";

type RichComposerConfig = {
  markdown: string;
  onMarkdownChange: (value: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  disabled?: boolean;
};

export type RichComposerActions = {
  focus: () => void;
  handleKeyboardShortcut: (
    event: Pick<
      React.KeyboardEvent<HTMLElement>,
      "altKey" | "ctrlKey" | "key" | "metaKey" | "preventDefault"
    >,
  ) => boolean;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleInlineCode: () => void;
  toggleCodeBlock: () => void;
  toggleBlockquote: () => void;
  setHeading: (level: 1 | 2 | 3) => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  insertHorizontalRule: () => void;
};

const TURNDOWN = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

// Haven markdown uses `__text__` for underline (not GFM strikethrough). Preprocess sends `<u>` into marked; turndown maps `<u>` back.
TURNDOWN.addRule("havenUnderline", {
  filter: ["u"],
  replacement(content: string) {
    return `__${content}__`;
  },
});

const normalizeMarkdown = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\s+$/g, "");

const markdownToHtml = (markdown: string) => {
  if (!markdown.trim()) return "<p></p>";
  const withUnderlineHtml = markdown.replace(
    /__(?=\S)([\s\S]*?\S)__/g,
    "<u>$1</u>",
  );
  return marked.parse(withUnderlineHtml, {
    gfm: true,
    breaks: true,
  }) as string;
};

const htmlToMarkdown = (html: string) => {
  if (!html.trim()) return "";
  const markdown = TURNDOWN.turndown(html);
  return normalizeMarkdown(markdown);
};

const isEmptyDoc = (editor: Editor) => editor.state.doc.textContent.length === 0;

export function useRichComposer({
  markdown,
  onMarkdownChange,
  placeholder,
  onSubmit,
  disabled = false,
}: RichComposerConfig) {
  const lastMarkdownRef = React.useRef(normalizeMarkdown(markdown));
  const skipNextUpdateRef = React.useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(markdown),
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[52px] max-h-[200px] overflow-y-auto px-0 py-0 pb-[14px] pt-[14px] leading-6 text-[#e6edf7] focus:outline-none",
      },
      handleKeyDown(_view, event) {
        if (event.isComposing) return false;
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: nextEditor }) {
      if (skipNextUpdateRef.current) {
        skipNextUpdateRef.current = false;
        return;
      }
      const nextMarkdown = isEmptyDoc(nextEditor)
        ? ""
        : htmlToMarkdown(nextEditor.getHTML());
      lastMarkdownRef.current = nextMarkdown;
      onMarkdownChange(nextMarkdown);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // Run before paint so the composer does not flash previous text after send (parent clears to "").
  React.useLayoutEffect(() => {
    if (!editor) return;
    const normalized = normalizeMarkdown(markdown);
    const editorHasText = !isEmptyDoc(editor);
    // Parent cleared but refs already agreed on "" while the doc is stale (e.g. setOptions vs onUpdate ordering).
    const mustForceEmpty = normalized === "" && editorHasText;
    if (normalized === lastMarkdownRef.current && !mustForceEmpty) {
      return;
    }
    skipNextUpdateRef.current = true;
    editor.commands.setContent(markdownToHtml(markdown), { emitUpdate: false });
    lastMarkdownRef.current = normalized;
  }, [editor, markdown]);

  const actions = React.useMemo<RichComposerActions>(() => {
    const run = (command: (editor: Editor) => boolean) => {
      if (!editor || disabled) return;
      command(editor);
    };

    return {
      focus: () => {
        if (!editor || disabled) return;
        editor.commands.focus();
      },
      handleKeyboardShortcut: (event) => {
        if (!editor || disabled) return false;
        const modifier = event.ctrlKey || event.metaKey;
        if (!modifier || event.altKey) return false;
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          editor.chain().focus().toggleBold().run();
          return true;
        }
        if (key === "i") {
          event.preventDefault();
          editor.chain().focus().toggleItalic().run();
          return true;
        }
        if (key === "u") {
          event.preventDefault();
          editor.chain().focus().toggleUnderline().run();
          return true;
        }
        return false;
      },
      toggleBold: () => run((value) => value.chain().focus().toggleBold().run()),
      toggleItalic: () =>
        run((value) => value.chain().focus().toggleItalic().run()),
      toggleUnderline: () =>
        run((value) => value.chain().focus().toggleUnderline().run()),
      toggleStrike: () =>
        run((value) => value.chain().focus().toggleStrike().run()),
      toggleInlineCode: () =>
        run((value) => value.chain().focus().toggleCode().run()),
      toggleCodeBlock: () =>
        run((value) => value.chain().focus().toggleCodeBlock().run()),
      toggleBlockquote: () =>
        run((value) => value.chain().focus().toggleBlockquote().run()),
      setHeading: (level) =>
        run((value) => value.chain().focus().toggleHeading({ level }).run()),
      toggleBulletList: () =>
        run((value) => value.chain().focus().toggleBulletList().run()),
      toggleOrderedList: () =>
        run((value) => value.chain().focus().toggleOrderedList().run()),
      insertHorizontalRule: () =>
        run((value) => value.chain().focus().setHorizontalRule().run()),
    };
  }, [disabled, editor]);

  return { editor, actions };
}

type RichComposerInputProps = {
  editor: Editor | null;
  className?: string;
};

export function RichComposerInput({ editor, className }: RichComposerInputProps) {
  return (
    <div className={cn("min-h-[52px] max-h-[200px] px-0 py-0", className)}>
      <EditorContent editor={editor} />
    </div>
  );
}

