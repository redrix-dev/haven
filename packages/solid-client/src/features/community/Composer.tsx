import { Show, createSignal, onCleanup } from "solid-js";
import { ImagePlus, SendHorizontal, X } from "lucide-solid";
import { normalizeCommunityMarkdown } from "@shared/features/messaging/utils/communityMarkdownParity";
import { Button } from "@solid-client/components/ui";

/**
 * Plain-textarea composer (rich editing is a later phase). Owns the
 * cross-platform send contract: text is normalized via
 * normalizeCommunityMarkdown before it leaves this component.
 * Enter sends, Shift+Enter inserts a newline. An optional image attaches via
 * the file picker; the caller decides whether to route text or media.
 */
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
  let textarea: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const autogrow = () => {
    if (!textarea) return;
    textarea.style.height = "0";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
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
    if (fileInput) fileInput.value = "";
  };

  // The optimistic preview URL stays alive after send (it's handed to the
  // message for instant display), so only revoke on unmount.
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
      if (textarea) textarea.value = "";
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
      <div class="flex items-end gap-2 rounded-xl bg-surface-input px-3 py-2">
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          class="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
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
  );
}
