import { For, type JSX } from "solid-js";
import type { Token, Tokens } from "marked";
import { Spoiler } from "./Spoiler";
import type { SpoilerToken } from "./chatMarkdown";

/**
 * Renders a marked token tree as Solid JSX. Security model: every piece of
 * text goes through Solid text nodes (auto-escaped), `html` tokens render as
 * inert plain text, and link hrefs are protocol-filtered — there is no
 * innerHTML anywhere in this tree, so no sanitizer is needed.
 *
 * Tokens are immutable per message render (a content change re-lexes and
 * remounts), so this renders with plain switch dispatch instead of reactive
 * <Switch> tracking.
 */
export function MarkdownTokens(props: { tokens: Token[] }) {
  return <For each={props.tokens}>{(token) => renderToken(token)}</For>;
}

const SAFE_HREF_RE = /^(https?:|mailto:)/i;

function renderToken(token: Token): JSX.Element {
  switch (token.type) {
    case "paragraph":
      return (
        <p class="whitespace-pre-wrap not-first:mt-1">
          <MarkdownTokens tokens={(token as Tokens.Paragraph).tokens} />
        </p>
      );
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens ? <MarkdownTokens tokens={t.tokens} /> : <>{t.text}</>;
    }
    case "strong":
      return (
        <strong class="font-bold">
          <MarkdownTokens tokens={(token as Tokens.Strong).tokens} />
        </strong>
      );
    case "em":
      return (
        <em>
          <MarkdownTokens tokens={(token as Tokens.Em).tokens} />
        </em>
      );
    case "del":
      return (
        <del>
          <MarkdownTokens tokens={(token as Tokens.Del).tokens} />
        </del>
      );
    case "codespan":
      return (
        <code class="rounded bg-surface-inset px-1 py-0.5 font-mono text-[0.85em]">
          {(token as Tokens.Codespan).text}
        </code>
      );
    case "code":
      return (
        <pre class="my-1 overflow-x-auto rounded-lg border border-border bg-surface-inset p-2 font-mono text-[0.85em]">
          <code>{(token as Tokens.Code).text}</code>
        </pre>
      );
    case "link": {
      const t = token as Tokens.Link;
      if (!SAFE_HREF_RE.test(t.href)) {
        return <MarkdownTokens tokens={t.tokens} />;
      }
      return (
        <a
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:underline"
        >
          <MarkdownTokens tokens={t.tokens} />
        </a>
      );
    }
    case "blockquote":
      return (
        <blockquote class="my-1 border-l-2 border-border-reply-thread pl-3 text-body-soft">
          <MarkdownTokens tokens={(token as Tokens.Blockquote).tokens} />
        </blockquote>
      );
    case "list": {
      const t = token as Tokens.List;
      const items = (
        <For each={t.items}>
          {(item) => (
            <li>
              <MarkdownTokens tokens={item.tokens} />
            </li>
          )}
        </For>
      );
      return t.ordered ? (
        <ol class="my-1 list-decimal pl-6">{items}</ol>
      ) : (
        <ul class="my-1 list-disc pl-6">{items}</ul>
      );
    }
    case "heading": {
      // Chat headings render as emphasized text, not document headings.
      const t = token as Tokens.Heading;
      const size =
        t.depth === 1 ? "text-xl" : t.depth === 2 ? "text-lg" : "text-base";
      return (
        <p class={`my-1 font-bold ${size}`}>
          <MarkdownTokens tokens={t.tokens} />
        </p>
      );
    }
    case "hr":
      return <hr class="my-2 border-border" />;
    case "br":
      return <br />;
    case "space":
      return null;
    case "escape":
      return <>{(token as Tokens.Escape).text}</>;
    case "spoiler":
      return (
        <Spoiler>
          <MarkdownTokens tokens={(token as unknown as SpoilerToken).tokens} />
        </Spoiler>
      );
    case "html":
      // Inert by design — raw HTML shows as the text the user typed.
      return <>{token.raw}</>;
    case "image":
      // Inline images aren't part of the chat surface; show the source text.
      return <>{token.raw}</>;
    default:
      return <>{"raw" in token ? token.raw : ""}</>;
  }
}
