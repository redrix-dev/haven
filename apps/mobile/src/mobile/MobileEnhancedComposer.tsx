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
import { MobilePopoverCard } from '@mobile/mobile/layout/MobileSurfacePrimitives';

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
  contentEditableRef,
  draft,
  onDraftChange,
}: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  const applyFormat = (prefix: string, suffix: string) => {
    const el = contentEditableRef.current;
    if (!el) return;

    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    const selectedText = range?.toString() ?? '';
    const wrapped = `${prefix}${selectedText || 'text'}${suffix}`;
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
    <MobilePopoverCard
      open
      onClose={onClose}
      label="Attachment Menu"
      id="mobile-enhanced-attachment-menu"
      placement="docked"
    >
      <div className="p-4">
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
    </MobilePopoverCard>
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
    <MobilePopoverCard
      open
      onClose={onClose}
      label="Emoji Picker"
      id="mobile-enhanced-emoji-picker"
      placement="docked"
      className="inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-[#0d1525]"
    >
      <div style={{ height: '280px' }}>
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
    </MobilePopoverCard>
  );
}

export function EnhancedComposer({
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
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [mediaExpiresInHours, setMediaExpiresInHours] = useState(24);
  useEffect(() => {
    if (contentEditableRef.current && draft) {
      contentEditableRef.current.innerText = draft;
    }
  }, []);
    const handleSend = () => {
        const el = contentEditableRef.current;
        if (!el) return;
        const content = el.innerText.trim();
        if (!content && !mediaFile) return;
        if (sending) return;
        onDraftChange(content); // sync to parent first
        onSend();
        el.innerText = '';
        onDraftChange('');
    };

return (
    <div className="shrink-0 border-t border-white/10 bg-[#0d1525] px-3 py-3">
        <ComposerFormattingToolbar
          contentEditableRef={contentEditableRef}
          draft={draft}
          onDraftChange={onDraftChange}
        />
        <div className="mx-auto w-full max-w-[24rem] flex items-center">
            <div 
                ref={contentEditableRef}            
                contentEditable
                suppressContentEditableWarning 
                className="relative rounded-[1.2rem] border border-white/10 bg-white/5 outline outline-2 outline-white/20 outline-offset-2 min-h-[48px] flex items-center px-4 overflow-hidden w-full break-all"/>
                <button
                    type="button"
                    onClick={handleSend}
                    className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white ml-2"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                 </svg>
                </button>
        </div>
    </div>
);
}
