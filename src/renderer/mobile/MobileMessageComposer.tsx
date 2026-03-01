import React, { useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';

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
}

export function MobileMessageComposer({
  draft,
  onDraftChange,
  onSend,
  sending = false,
  placeholder = 'Message...',
  replyTarget,
  onClearReply,
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
      // Only on non-touch devices (physical keyboard connected)
      if (window.matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        if (draft.trim() && !sending) onSend();
      }
    }
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <div className="shrink-0 bg-[#0d1525] border-t border-white/10">
      {/* Reply target banner */}
      {replyTarget && (
        <div className="flex items-center gap-2 px-3 pt-2">
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
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={sending}
          rows={1}
          className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50 transition-colors leading-relaxed disabled:opacity-50"
          style={{ minHeight: '42px' }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors ${
            canSend
              ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'
              : 'bg-white/5 cursor-default'
          }`}
        >
          <Send className={`w-4 h-4 ${canSend ? 'text-white' : 'text-gray-600'}`} />
        </button>
      </div>
    </div>
  );
}
