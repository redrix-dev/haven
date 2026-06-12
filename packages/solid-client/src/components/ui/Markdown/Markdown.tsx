import { createMemo } from "solid-js";
import { cn } from "../cn";
import { lexChatMarkdown } from "./chatMarkdown";
import { MarkdownTokens } from "./MarkdownTokens";

/**
 * Chat message markdown. `content` is the raw message text (already
 * normalized by the composer per the parity contract); lexing happens here.
 */
export function Markdown(props: { content: string; class?: string }) {
  const tokens = createMemo(() => lexChatMarkdown(props.content));
  return (
    <div class={cn("break-words text-sm leading-relaxed", props.class)}>
      <MarkdownTokens tokens={tokens()} />
    </div>
  );
}
