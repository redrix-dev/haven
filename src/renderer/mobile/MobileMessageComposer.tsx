import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ReplyTarget {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MobileMessageComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  placeholder?: string;
  replyTarget?: ReplyTarget | null;
  onClearReply?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function MobileMessageComposer({
  draft,
  onDraftChange,
  onSend,
  sending = false,
  placeholder = 'Message...',
  replyTarget,
  onClearReply,
  onFocus,
  onBlur,
}: MobileMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <div
      className="shrink-0 border-t border-white/10 bg-[#0d1525]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {replyTarget && (
        <div className="px-4 pt-2">
          <div className="mx-auto flex w-full max-w-[28rem] items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg border-l-2 border-blue-400 bg-blue-600/20 px-3 py-1.5">
              <p className="truncate text-[11px] font-medium text-blue-400">
                Replying to {replyTarget.authorLabel}
              </p>
              <p className="truncate text-[11px] text-gray-400">{replyTarget.preview}</p>
            </div>
            <button
              type="button"
              onClick={onClearReply}
              className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-0.5">
        <div className="mx-auto w-full max-w-[24rem]">
          <div className="relative rounded-[1.4rem] border border-white/10 bg-white/5 transition-colors focus-within:border-blue-500/50">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={placeholder}
              disabled={sending}
              rows={1}
              inputMode="text"
              autoComplete="off"
              className="block w-full resize-none bg-transparent px-4 py-2.5 pr-14 text-base leading-relaxed text-white placeholder-gray-500 focus:outline-none disabled:opacity-50"
              style={{ minHeight: '42px' }}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send message"
              className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition-colors disabled:bg-white/10 disabled:text-gray-500"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
