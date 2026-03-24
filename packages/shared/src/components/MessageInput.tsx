import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from '@shared/components/ui/input';
import { Button } from '@shared/components/ui/button';
import { getErrorMessage } from '@platform/lib/errors';

interface MessageInputProps {
  onSendMessage: (
    content: string,
    options?: {
      replyToMessageId?: string;
      mediaFile?: File;
      mediaExpiresInHours?: number;
    }
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
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaExpiresInHours, setMediaExpiresInHours] = useState(24);
  const [sendError, setSendError] = useState<string | null>(null);

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

    if (typeof ResizeObserver === 'undefined') {
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
      setInput('');
      setMediaFile(null);
      setMediaExpiresInHours(24);
      onClearReplyTarget?.();
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
      setSendError(getErrorMessage(error, 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={containerRef}
      data-message-input-root="true"
      className="shrink-0 border-t border-[#263a58] bg-[#0f1728] px-4 py-3 space-y-2 shadow-[0_-8px_18px_rgba(3,9,20,0.35)]"
    >
      {replyTarget && (
        <div className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Replying to {replyTarget.authorLabel}</p>
            <p className="text-xs text-[#d2dcef] truncate">{replyTarget.preview}</p>
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
        <div className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Media attached</p>
            <p className="text-xs text-[#d2dcef] truncate">{mediaFile.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#a9b8cf]">
              Expires
              <select
                value={mediaExpiresInHours}
                onChange={(event) => setMediaExpiresInHours(Number(event.target.value))}
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
      <div className="flex items-center gap-2">
        <label className="shrink-0">
          <input
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              if (!nextFile) return;
              setMediaFile(nextFile);
              setSendError(null);
              event.currentTarget.value = '';
            }}
          />
          <span
            className="inline-flex h-9 items-center rounded-md border border-[#304867] px-3 text-xs text-[#d2dcef] hover:bg-[#22334f] cursor-pointer"
          >
            Attach
          </span>
        </label>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={`Message #${channelName}`}
          className="bg-[#243754] border-none text-[#e6edf7] placeholder:text-[#8897b1]"
        />
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={(!input.trim() && !mediaFile) || sending}
          className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
        >
          {sending ? 'Sending...' : 'Send'}
        </Button>
      </div>
      {/* CHECKPOINT 2 COMPLETE */}
      {sendError && <p className="text-xs text-[#f87171]">{sendError}</p>}
    </div>
  );
}

