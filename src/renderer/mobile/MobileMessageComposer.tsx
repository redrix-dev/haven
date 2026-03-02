import React, { useRef, useEffect } from 'react';
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

  // Auto-resize textarea up to ~5 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile, Enter key adds a newline naturally — don't intercept
    // Physical keyboard: Enter sends, Shift+Enter newline (desktop-style)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (draft.trim() && !sending) onSend();
    }
  };
  return (
    <div
      className="shrink-0 bg-[#0d1525] border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Reply target banner */}
      {replyTarget && (
        <div className="px-3 pt-2">
          <div className="mx-auto flex w-full max-w-[34rem] items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-blue-600/20 border-l-2 border-blue-400">
              <p className="text-[11px] text-blue-400 font-medium truncate">
                Replying to {replyTarget.authorLabel}
              </p>
              <p className="text-[11px] text-gray-400 truncate">{replyTarget.preview}</p>
            </div>
            <button
              onClick={onClearReply}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="px-3 py-3">
        <div className="mx-auto w-full max-w-[34rem]">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={sending}
            rows={1}
            enterKeyHint="send"
            inputMode="text"
            autoComplete="off"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-base text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50 transition-colors leading-relaxed disabled:opacity-50"
            style={{ minHeight: '42px' }}
          />
        </div>
      </div>
    </div>
  );
}
