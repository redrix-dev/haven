/**
 * MobileMessageComposer — rich mobile message input.
 *
 * Composition layout:
 *   <MobileMessageComposer>
 *     <ComposerMediaPreview />      ← attachment strip
 *     <ComposerReplyBanner />       ← reply target
 *     <ComposerFormattingToolbar /> ← formatting shortcuts (toggled by Aa button)
 *     <ComposerInputRow>
 *       <ComposerAddButton />       ← + attachment menu
 *       <ComposerTextArea />        ← textarea (touch/scroll logic UNCHANGED)
 *       <ComposerEmojiButton />     ← emoji overlay
 *       <ComposerSendButton />      ← send
 *     </ComposerInputRow>
 *   </MobileMessageComposer>
 *
 * ⚠️  Touch / scroll / z-index logic is intentionally preserved from the
 *     original implementation. Do NOT change touchAction, overscroll, or
 *     safe-area logic without re-testing on iOS Safari.
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Smile, Bold, Italic, Strikethrough, Code, Quote } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReplyTarget {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MediaFile {
  file: File;
  previewUrl: string;
}

export interface MediaAttachment {
  file: File;
  expiresInHours: number;
}

export interface MobileMessageComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  /** Called when user presses send. Receives any attached media so the parent can send both at once. */
  onSend: (mediaAttachment?: MediaAttachment) => void;
  sending?: boolean;
  placeholder?: string;
  replyTarget?: ReplyTarget | null;
  onClearReply?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

// ── Emoji data — common emojis by category ────────────────────────────────────

const EMOJI_CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Smileys',
    emojis: [
      '😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','😏',
      '😅','😇','🙂','😉','🥳','😋','😜','🤪','😝','🤑',
      '😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩',
      '🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','😱',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍','👎','👌','✌️','🤞','🤟','🤙','👏','🙌','🤝',
      '👋','🤚','🖐️','✋','🖖','💪','🦵','🦶','👀','👁️',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🎉','🎊','🎈','🎁','🔥','⚡','✨','🌟','💫','🌈',
      '🍕','🍔','🌮','🍣','☕','🍺','🎮','📱','💻','🎵',
    ],
  },
];

// ── ComposerMediaPreview ──────────────────────────────────────────────────────

function ComposerMediaPreview({
  media,
  expiresInHours,
  onExpireChange,
  onRemove,
}: {
  media: MediaFile | null;
  expiresInHours: number;
  onExpireChange: (h: number) => void;
  onRemove: () => void;
}) {
  if (!media) return null;

  const isImage = media.file.type.startsWith('image/');

  return (
    <div className="px-3 pt-2">
      <div className="mx-auto w-full max-w-[24rem] flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 px-3 py-2">
        {isImage ? (
          <img
            src={media.previewUrl}
            alt="attachment"
            className="w-14 h-14 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center text-gray-400 text-xs shrink-0">
            FILE
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 truncate">{media.file.name}</p>
          {/* Expiry selector */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {[1, 24, 168, 720].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onExpireChange(h)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  expiresInHours === h
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/15'
                }`}
              >
                {h === 1 ? '1h' : h === 24 ? '1d' : h === 168 ? '7d' : '30d'}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X className="w-3 h-3 text-gray-400" />
        </button>
      </div>
    </div>
  );
}

// ── ComposerReplyBanner ───────────────────────────────────────────────────────
// Preserving original reply target display exactly.

function ComposerReplyBanner({
  replyTarget,
  onClearReply,
}: {
  replyTarget: ReplyTarget | null | undefined;
  onClearReply?: () => void;
}) {
  if (!replyTarget) return null;

  return (
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
  );
}

// ── ComposerFormattingToolbar ─────────────────────────────────────────────────

const FORMATTING_ACTIONS: Array<{
  label: string;
  icon: React.ReactNode;
  prefix: string;
  suffix: string;
}> = [
  { label: 'Bold', icon: <Bold className="w-4 h-4" />, prefix: '**', suffix: '**' },
  { label: 'Italic', icon: <Italic className="w-4 h-4" />, prefix: '*', suffix: '*' },
  { label: 'Strikethrough', icon: <Strikethrough className="w-4 h-4" />, prefix: '~~', suffix: '~~' },
  { label: 'Code', icon: <Code className="w-4 h-4" />, prefix: '`', suffix: '`' },
  { label: 'Quote', icon: <Quote className="w-4 h-4" />, prefix: '> ', suffix: '' },
];

function ComposerFormattingToolbar({
  textareaRef,
  draft,
  onDraftChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  const applyFormat = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end);
    const wrapped = `${prefix}${selected || 'text'}${suffix}`;
    const next = draft.slice(0, start) + wrapped + draft.slice(end);
    onDraftChange(next);

    // Restore cursor after state update
    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + (selected || 'text').length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  return (
    <div className="px-3 pb-1">
      <div
        className="mx-auto w-full max-w-[24rem] flex items-center gap-1 overflow-x-auto"
        style={{ touchAction: 'pan-x' }}
      >
        {FORMATTING_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onMouseDown={(e) => {
              // Prevent blur on textarea
              e.preventDefault();
              applyFormat(action.prefix, action.suffix);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              applyFormat(action.prefix, action.suffix);
            }}
            aria-label={action.label}
            className="shrink-0 flex items-center justify-center w-9 h-8 rounded-lg text-gray-400 hover:bg-white/10 hover:text-gray-200 active:bg-white/15 transition-colors"
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── AttachmentMenu ────────────────────────────────────────────────────────────

function AttachmentMenu({
  onSelectFile,
  onClose,
}: {
  onSelectFile: (file: File) => void;
  onClose: () => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Tap-outside to close */}
      <div className="fixed inset-0 z-[55]" onClick={onClose} style={{ touchAction: 'none' }} />

      <div
        className="mobile-bottom-card fixed inset-x-4 z-[60] rounded-2xl bg-[#111c30] border border-white/10 p-4 shadow-xl"
        style={{ touchAction: 'none' }}
      >
        <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-3">
          Attach
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <span className="text-2xl">🖼️</span>
            <span className="text-xs text-gray-300">Photo/Video</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <span className="text-2xl">📎</span>
            <span className="text-xs text-gray-300">File</span>
          </button>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onSelectFile(f); onClose(); }
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onSelectFile(f); onClose(); }
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
}

// ── EmojiPicker ───────────────────────────────────────────────────────────────

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const category = EMOJI_CATEGORIES[tab];

  return (
    <>
      {/* Tap-outside to close */}
      <div className="fixed inset-0 z-[55]" onClick={onClose} style={{ touchAction: 'none' }} />

      <div
        className="mobile-bottom-card fixed inset-x-0 z-[60] bg-[#0d1525] border-t border-white/10 shadow-xl"
        style={{ height: '280px', touchAction: 'none' }}
      >
        {/* Category tabs */}
        <div className="flex border-b border-white/5 px-2">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              type="button"
              onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors ${
                tab === i ? 'text-blue-400 border-b-2 border-blue-400 -mb-px' : 'text-gray-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div
          className="grid grid-cols-8 gap-0.5 px-2 py-2 overflow-y-auto"
          style={{ height: 'calc(100% - 40px)', touchAction: 'pan-y' }}
        >
          {category.emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onSelect(emoji); onClose(); }}
              className="flex items-center justify-center w-full aspect-square text-2xl rounded-lg hover:bg-white/10 active:bg-white/15 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── MobileMessageComposer ─────────────────────────────────────────────────────

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
  const [showAttachment, setShowAttachment] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [mediaExpiresInHours, setMediaExpiresInHours] = useState(24);

  // ── Preserved original textarea height + touchAction logic ────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

    const isOverflowing = el.scrollHeight > 120;
    el.style.touchAction = isOverflowing ? 'auto' : 'none';
  }, [draft]);

  const canSend = (draft.trim().length > 0 || mediaFile !== null) && !sending;

  const handleSend = () => {
    const attachment = mediaFile
      ? { file: mediaFile.file, expiresInHours: mediaExpiresInHours }
      : undefined;
    onSend(attachment);
    // Clear media after send
    setMediaFile(null);
    setMediaExpiresInHours(24);
  };

  const handleSelectMedia = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setMediaFile({ file, previewUrl });
  };

  const handleRemoveMedia = () => {
    if (mediaFile) URL.revokeObjectURL(mediaFile.previewUrl);
    setMediaFile(null);
  };

  const handleInsertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      onDraftChange(draft + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    onDraftChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    // ── Preserved: outer wrapper with touchAction none + safe-area ──────────
    <div
      className="shrink-0 border-t border-white/10 bg-[#0d1525]"
      style={{ paddingBottom: '0px', touchAction: 'none' }}
    >
      {/* Media preview strip */}
      <ComposerMediaPreview
        media={mediaFile}
        expiresInHours={mediaExpiresInHours}
        onExpireChange={setMediaExpiresInHours}
        onRemove={handleRemoveMedia}
      />

      {/* Reply target banner — preserved from original */}
      <ComposerReplyBanner replyTarget={replyTarget} onClearReply={onClearReply} />

      {/* Formatting toolbar — toggled by Aa button */}
      <ComposerFormattingToolbar
          textareaRef={textareaRef}
          draft={draft}
          onDraftChange={onDraftChange}
        />

      {/* Input row */}
      {/* Preserved: touchAction none on wrapper divs */}
      <div className="px-3 py-2" style={{ touchAction: 'none' }}>
        <div className="mx-auto w-full max-w-[24rem]" style={{ touchAction: 'none' }}>
          <div
            className="relative rounded-[1.4rem] border border-white/10 bg-white/5 transition-colors focus-within:border-blue-500/50 flex items-center gap-1 px-2 py-1.5"
            style={{ touchAction: 'none' }}
          >
            {/* + Attachment button */}
            <button
              type="button"
              onClick={() => { setShowAttachment(true); setShowEmoji(false); }}
              aria-label="Add attachment"
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Textarea — touch/scroll logic preserved exactly from original */}
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
              className="flex-1 resize-none bg-transparent py-2.75 text-base leading-relaxed text-white placeholder-gray-500 focus:outline-none disabled:opacity-50"
              style={{ minHeight: '38px', height: '38px', touchAction: 'none' }}
            />

            

            {/* Emoji button */}
            <button
              type="button"
              onClick={() => { setShowEmoji((v) => !v); }}
              aria-label="Emoji"
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                showEmoji
                  ? 'bg-blue-600/30 text-blue-400'
                  : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Send button — preserved from original */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition-colors disabled:bg-white/10 disabled:text-gray-500"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Overlays */}
      {showAttachment && (
        <AttachmentMenu
          onSelectFile={handleSelectMedia}
          onClose={() => setShowAttachment(false)}
        />
      )}
      {showEmoji && (
        <EmojiPicker
          onSelect={handleInsertEmoji}
          onClose={() => setShowEmoji(false)}
        />
      )}
    </div>
  );
}
