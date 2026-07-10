import { For, type Component } from "solid-js";
import {
  Bold,
  Code,
  EyeOff,
  Italic,
  Link,
  Quote,
  SquareCode,
  Strikethrough,
  Underline,
} from "lucide-solid";
import {
  COMMUNITY_MARKDOWN_FORMATS,
  type CommunityMarkdownFormat,
} from "@shared/features/messaging/utils/communityMarkdownParity";
import { Button } from "../Button";

const FORMAT_NAMES = Object.keys(
  COMMUNITY_MARKDOWN_FORMATS,
) as CommunityMarkdownFormat[];

const FORMAT_ICONS: Record<
  CommunityMarkdownFormat,
  Component<{ size?: number }>
> = {
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strikethrough: Strikethrough,
  inlineCode: Code,
  codeBlock: SquareCode,
  blockquote: Quote,
  link: Link,
  spoiler: EyeOff,
};

/** A data-free formatting toolbar shared by the community and DM composers. */
export function MarkdownToolbar(props: {
  disabled?: boolean;
  onFormat: (format: CommunityMarkdownFormat) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Message formatting"
      class="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
    >
      <For each={FORMAT_NAMES}>
        {(formatName) => {
          const format = COMMUNITY_MARKDOWN_FORMATS[formatName];
          const Icon = FORMAT_ICONS[formatName];
          const displayKey =
            "displayKey" in format.shortcut
              ? format.shortcut.displayKey
              : format.shortcut.key;
          const shortcut = `${format.shortcut.shiftKey ? "Shift+" : ""}${displayKey.toUpperCase()}`;
          const keyShortcuts = `${format.shortcut.shiftKey ? "Meta+Shift" : "Meta"}+${format.shortcut.key.toUpperCase()} ${format.shortcut.shiftKey ? "Control+Shift" : "Control"}+${format.shortcut.key.toUpperCase()}`;

          return (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              class="h-7 w-7 rounded-md"
              aria-label={format.label}
              aria-keyshortcuts={keyShortcuts}
              title={`${format.label} (Cmd/Ctrl+${shortcut})`}
              disabled={props.disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => props.onFormat(formatName)}
            >
              <Icon size={15} />
            </Button>
          );
        }}
      </For>
    </div>
  );
}
