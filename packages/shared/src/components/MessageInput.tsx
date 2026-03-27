import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@shared/components/ui/button";
import { Textarea } from "@shared/components/ui/textarea";
import {
  MessageToolbar,
  type MessageToolbarHandle,
} from "@shared/components/MessageToolbar";
import { getErrorMessage } from "@platform/lib/errors";
import { Plus } from "lucide-react";

interface MessageInputProps {
  onSendMessage: (
    content: string,
    options?: {
      replyToMessageId?: string;
      mediaFile?: File;
      mediaExpiresInHours?: number;
    },
  ) => Promise<void>;
  channelId: string;
  channelName: string;
  replyTarget?: {
    id: string;
    authorLabel: string;
    preview: string;
  } | null;
  onClearReplyTarget?: () => void;
  onContainerHeightChange?: (height: number) => void;
}

export function MessageInput({
  onSendMessage,
  channelId,
  channelName,
  replyTarget = null,
  onClearReplyTarget,
  onContainerHeightChange,
}: MessageInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<MessageToolbarHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaExpiresInHours, setMediaExpiresInHours] = useState(24);
  const [sendError, setSendError] = useState<string | null>(null);

  const syncInputHeight = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    const nextHeight = Math.min(node.scrollHeight, 200);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = node.scrollHeight > 200 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    setMediaFile(null);
    setMediaExpiresInHours(24);
    setSendError(null);
  }, [channelId]);

  useEffect(() => {
    if (!sendError) return;
    const timeoutId = window.setTimeout(() => {
      setSendError(null);
    }, 6000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [sendError]);

  useLayoutEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  useLayoutEffect(() => {
    if (!onContainerHeightChange || !containerRef.current) return;

    const node = containerRef.current;
    let lastHeight = -1;

    const emitHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (nextHeight === lastHeight) return;
      lastHeight = nextHeight;
      onContainerHeightChange(nextHeight);
    };

    emitHeight();

    if (typeof ResizeObserver === "undefined") {
      return () => {
        onContainerHeightChange(0);
      };
    }

    const observer = new ResizeObserver(() => {
      emitHeight();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      onContainerHeightChange(0);
    };
  }, [onContainerHeightChange]);

  const handleAttachFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextFile = event.target.files?.[0] ?? null;
      event.currentTarget.value = "";
      if (!nextFile) return;
      setMediaFile(nextFile);
      setSendError(null);
      inputRef.current?.focus();
    },
    [],
  );

  const handleSubmit = async () => {
    const content = input.trim();
    if ((!content && !mediaFile) || sending) return;

    setSending(true);
    setSendError(null);

    try {
      await onSendMessage(content, {
        replyToMessageId: replyTarget?.id,
        mediaFile: mediaFile ?? undefined,
        mediaExpiresInHours: mediaFile ? mediaExpiresInHours : undefined,
      });
      setInput("");
      setMediaFile(null);
      setMediaExpiresInHours(24);
      onClearReplyTarget?.();
    } catch (error: unknown) {
      console.error("Failed to send message:", error);
      setSendError(getErrorMessage(error, "Failed to send message."));
    } finally {
      setSending(false);
    }
  };

  const handleInputKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (toolbarRef.current?.handleKeyboardShortcut(event)) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSubmit();
  };

  return (
    <div ref={containerRef} className="relative shrink-0 space-y-2 px-4 pb-1 pt-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        className="hidden"
        onChange={handleAttachFileChange}
      />

      {replyTarget && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Replying to {replyTarget.authorLabel}
            </p>
            <p className="truncate text-xs text-[#d2dcef]">
              {replyTarget.preview}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearReplyTarget}
            className="text-[#a9b8cf] hover:text-white"
          >
            Cancel
          </Button>
        </div>
      )}

      {mediaFile && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Media attached
            </p>
            <p className="truncate text-xs text-[#d2dcef]">{mediaFile.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#a9b8cf]">
              Expires
              <select
                value={mediaExpiresInHours}
                onChange={(event) =>
                  setMediaExpiresInHours(Number(event.target.value))
                }
                className="ml-2 rounded border border-[#304867] bg-[#18243a] px-2 py-1 text-xs text-white"
              >
                <option value={1}>1h</option>
                <option value={24}>24h</option>
                <option value={168}>7d</option>
                <option value={720}>30d</option>
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMediaFile(null)}
              className="text-[#a9b8cf] hover:text-white"
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      <div className="relative rounded-[7.5px] border border-[#304867] bg-[#142033] shadow-[0_10px_24px_rgba(3,9,20,0.22)] transition-colors focus-within:border-[#3f79d8]">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute bottom-2.5 left-2.5 z-10 rounded-xl text-[#d2dcef] hover:bg-[#22334f] hover:text-white"
          title="Add file"
          aria-label="Add file"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="size-4" />
        </Button>

        <MessageToolbar
          ref={toolbarRef}
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          variant="menu"
          triggerLabel=". . ."
          triggerTitle="Formatting options"
          triggerClassName="absolute bottom-2.5 right-2.5 z-10 rounded-xl px-2 text-xs font-semibold tracking-[0.2em] text-[#d2dcef] hover:bg-[#22334f] hover:text-white"
          menuAlign="end"
        />

        <Textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          rows={1}
          placeholder={`Message #${channelName}`}
          className="min-h-[52px] max-h-[200px] resize-none border-none bg-transparent px-0 py-0 pb-[14px] pl-14 pr-16 pt-[14px] leading-6 text-[#e6edf7] placeholder:text-[#8897b1] shadow-none focus-visible:ring-0"
        />
      </div>

      {/* CHECKPOINT 3 COMPLETE */}
      {/* CHECKPOINT 5 COMPLETE */}
      {sendError && <p className="text-xs text-[#f87171]">{sendError}</p>}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#111a2b]"
      />
    </div>
  );
}
