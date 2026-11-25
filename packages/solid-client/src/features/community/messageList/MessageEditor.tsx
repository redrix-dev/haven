import { Show, createSignal } from "solid-js";
import { normalizeCommunityMarkdown } from "@shared/features/messaging/utils/communityMarkdownParity";

/**
 * Inline editor that replaces a message's text while it is being edited.
 * Enter saves, Shift+Enter adds a line, Escape cancels. A failed save keeps
 * the editor open with the error, so the text isn't lost.
 */
export function MessageEditor(props: {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = createSignal(props.initialContent);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const autogrow = (el: HTMLTextAreaElement) => {
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const save = async () => {
    const content = normalizeCommunityMarkdown(draft());
    if (!content.trim() || saving()) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your edit.");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div class="py-1">
      <textarea
        ref={(el) =>
          queueMicrotask(() => {
            autogrow(el);
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          })
        }
        value={draft()}
        rows={1}
        disabled={saving()}
        aria-label="Edit message"
        onInput={(e) => {
          setDraft(e.currentTarget.value);
          autogrow(e.currentTarget);
        }}
        onKeyDown={onKeyDown}
        class="w-full resize-none rounded-lg bg-surface-input px-3 py-2 text-sm leading-5 text-foreground focus:outline-hidden"
      />
      <Show when={error()}>
        <p class="mt-1 text-xs text-send-error">{error()}</p>
      </Show>
      <p class="mt-1 text-xs text-muted-foreground">
        escape to{" "}
        <button
          type="button"
          class="text-primary hover:underline"
          onClick={() => props.onCancel()}
        >
          cancel
        </button>{" "}
        · enter to{" "}
        <button
          type="button"
          class="text-primary hover:underline"
          disabled={saving()}
          onClick={() => void save()}
        >
          save
        </button>
      </p>
    </div>
  );
}
