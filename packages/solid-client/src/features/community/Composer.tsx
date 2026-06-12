import { Show, createSignal } from "solid-js";
import { SendHorizontal } from "lucide-solid";
import { normalizeCommunityMarkdown } from "@shared/features/messaging/utils/communityMarkdownParity";
import { Button } from "@solid-client/components/ui";

/**
 * Plain-textarea composer (rich editing is a later phase). Owns the
 * cross-platform send contract: text is normalized via
 * normalizeCommunityMarkdown before it leaves this component.
 * Enter sends, Shift+Enter inserts a newline.
 */
export function Composer(props: {
  channelName: string;
  onSend: (content: string) => Promise<void>;
}) {
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let textarea: HTMLTextAreaElement | undefined;

  const autogrow = () => {
    if (!textarea) return;
    textarea.style.height = "0";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const submit = async () => {
    const content = normalizeCommunityMarkdown(draft());
    if (!content.trim() || sending()) return;
    setSending(true);
    setError(null);
    try {
      await props.onSend(content);
      setDraft("");
      if (textarea) textarea.value = "";
      autogrow();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
      textarea?.focus();
    }
  };

  return (
    <div class="shrink-0 px-4 pb-4 pt-1">
      <Show when={error()}>
        <p class="mb-1 text-xs text-send-error">{error()}</p>
      </Show>
      <div class="flex items-end gap-2 rounded-xl bg-surface-input px-3 py-2">
        <textarea
          ref={textarea}
          rows={1}
          value={draft()}
          placeholder={`Message #${props.channelName}`}
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            autogrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          class="max-h-[200px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Send message"
          disabled={sending() || !draft().trim()}
          onClick={() => void submit()}
          class="h-8 w-8"
        >
          <SendHorizontal size={18} />
        </Button>
      </div>
    </div>
  );
}
