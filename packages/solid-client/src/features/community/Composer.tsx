import { Show, createSignal, onCleanup } from "solid-js";
import { ImagePlus, SendHorizontal, X } from "lucide-solid";
import { Button, MarkdownToolbar } from "@solid-client/components/ui";
import {
  insertCommunityLink,
  matchCommunityMarkdownShortcut,
  normalizeCommunityMarkdown,
  toggleCommunityMarkdown,
  type CommunityMarkdownFormat,
} from "@shared/features/messaging/utils/communityMarkdownParity";

export function Composer(props: {
  channelName: string;
  onSend: (
    content: string,
    media?: { file: File; previewUrl: string },
  ) => Promise<void>;
}) {
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [pendingImage, setPendingImage] = createSignal<{
    file: File;
    previewUrl: string;
  } | null>(null);
  // Open link dialog carries the selection range captured when it was opened,
  // since focus moves to the dialog inputs and the textarea selection is lost.
  const [linkModal, setLinkModal] = createSignal<{
    text: string;
    url: string;
    start: number;
    end: number;
    focusUrl: boolean;
  } | null>(null);

  let textarea: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const autogrow = () => {
    if (!textarea) return;
    textarea.style.height = "0";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const applyStyle = (format: CommunityMarkdownFormat) => {
    if (!textarea) return;

    const edit = toggleCommunityMarkdown(
      format,
      draft(),
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    setDraft(edit.value);

    queueMicrotask(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      autogrow();
    });
  };

  // Links need a text + URL, so route them to a dialog instead of dumping a
  // bare `[](url)` placeholder into the draft. Everything else toggles inline.
  const requestFormat = (format: CommunityMarkdownFormat) => {
    if (format === "link") {
      openLinkModal();
      return;
    }
    applyStyle(format);
  };

  const openLinkModal = () => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft().slice(Math.min(start, end), Math.max(start, end));
    setLinkModal({
      text: selected,
      url: "",
      start,
      end,
      focusUrl: selected.trim().length > 0,
    });
  };

  const closeLinkModal = () => {
    setLinkModal(null);
    queueMicrotask(() => textarea?.focus());
  };

  const confirmLinkModal = () => {
    const modal = linkModal();
    if (!modal || !modal.url.trim()) return;

    const edit = insertCommunityLink(draft(), modal.start, modal.end, {
      text: modal.text,
      url: modal.url,
    });
    setDraft(edit.value);
    setLinkModal(null);

    queueMicrotask(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      autogrow();
    });
  };

  const handleLinkModalKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmLinkModal();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeLinkModal();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const format = event.isComposing
      ? null
      : matchCommunityMarkdownShortcut({
          key: event.key,
          primaryModifier: event.metaKey || event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        });
    if (format) {
      event.preventDefault();
      requestFormat(format);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const pickImage = () => fileInput?.click();

  const setPickedImage = (file: File | undefined) => {
    if (!file) return;

    const previous = pendingImage();
    if (previous) URL.revokeObjectURL(previous.previewUrl);

    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const clearPendingImage = (options?: { retainPreview?: boolean }) => {
    const current = pendingImage();

    if (current && !options?.retainPreview) {
      URL.revokeObjectURL(current.previewUrl);
    }

    setPendingImage(null);

    if (fileInput) {
      fileInput.value = "";
    }
  };

  onCleanup(() => {
    const current = pendingImage();
    if (current) URL.revokeObjectURL(current.previewUrl);
  });

  const submit = async () => {
    const content = normalizeCommunityMarkdown(draft());
    const image = pendingImage();

    if ((!content.trim() && !image) || sending()) return;

    setSending(true);
    setError(null);

    try {
      await props.onSend(content, image ?? undefined);
      setDraft("");
      clearPendingImage({ retainPreview: true });
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

      <Show when={pendingImage()}>
        {(image) => (
          <div class="mb-2 flex items-center gap-2 rounded border border-border bg-surface-embed-chip px-2 py-2">
            <img
              src={image().previewUrl}
              alt=""
              class="h-12 w-12 rounded object-cover"
            />
            <span class="min-w-0 flex-1 truncate text-xs text-attachment-label">
              {image().file.name || "Image"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              class="h-7 w-7"
              aria-label="Remove image attachment"
              disabled={sending()}
              onClick={() => clearPendingImage()}
            >
              <X size={15} />
            </Button>
          </div>
        )}
      </Show>

      <Show when={linkModal()}>
        {(modal) => (
          <div class="mb-2 rounded-lg border border-border bg-surface-input p-3 shadow-lg">
            <div class="flex flex-col gap-2">
              <input
                ref={(el) => {
                  if (!modal().focusUrl) queueMicrotask(() => el.focus());
                }}
                value={modal().text}
                placeholder="Link text"
                aria-label="Link text"
                onInput={(e) =>
                  setLinkModal({ ...modal(), text: e.currentTarget.value })
                }
                onKeyDown={handleLinkModalKeyDown}
                class="rounded border border-border bg-surface-embed-chip px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
              />
              <input
                ref={(el) => {
                  if (modal().focusUrl) queueMicrotask(() => el.focus());
                }}
                value={modal().url}
                placeholder="https://…"
                aria-label="Link URL"
                type="url"
                inputmode="url"
                onInput={(e) =>
                  setLinkModal({ ...modal(), url: e.currentTarget.value })
                }
                onKeyDown={handleLinkModalKeyDown}
                class="rounded border border-border bg-surface-embed-chip px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
              />
              <div class="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={closeLinkModal}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!modal().url.trim()}
                  onClick={confirmLinkModal}
                >
                  Add link
                </Button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <div class="rounded-xl bg-surface-input">
        <MarkdownToolbar disabled={sending()} onFormat={requestFormat} />
        <div class="flex items-end gap-2 px-3 py-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            class="hidden"
            onChange={(e) => setPickedImage(e.currentTarget.files?.[0])}
          />

          <Button
            size="icon"
            variant="ghost"
            aria-label="Attach image"
            disabled={sending()}
            onClick={pickImage}
            class="h-8 w-8"
          >
            <ImagePlus size={18} />
          </Button>

          <textarea
            ref={textarea}
            rows={1}
            value={draft()}
            placeholder={`Message #${props.channelName}`}
            onInput={(e) => {
              setDraft(e.currentTarget.value);
              autogrow();
            }}
            onKeyDown={handleKeyDown}
            class="max-h-50 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />

          <Button
            size="icon"
            variant="ghost"
            aria-label="Send message"
            disabled={sending() || (!draft().trim() && !pendingImage())}
            onClick={() => void submit()}
            class="h-8 w-8"
          >
            <SendHorizontal size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
