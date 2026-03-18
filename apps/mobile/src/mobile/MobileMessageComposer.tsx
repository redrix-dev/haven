import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Plus,
  Smile,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';
import { MobilePopoverCard } from '@mobile/mobile/layout/MobileSurfacePrimitives';

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
  onSend: (mediaAttachment?: MediaAttachment) => void;
  sending?: boolean;
  placeholder?: string;
  replyTarget?: ReplyTarget | null;
  onClearReply?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  attachmentMode?: 'all' | 'images-only';
}

const EMOJI_CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '😏',
      '😅', '😇', '🙂', '😉', '🥳', '😋', '😜', '🤪', '😝', '🤑',
      '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩',
      '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '😱',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👏', '🙌', '🤝',
      '👋', '🤚', '🖐️', '✋', '🖖', '💪', '🦵', '🦶', '👀', '👁️',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🔥', '⚡', '✨', '🌟', '💫', '🌈',
      '🍕', '🍔', '🌮', '🍣', '☕', '🍺', '🎮', '📱', '💻', '🎵',
    ],
  },
];

const EMOJI_PICKER_CATEGORIES: Array<{ label: string; emojis: string[] }> =
  EMOJI_CATEGORIES.slice(0, 0).concat([
  {
    label: 'Smileys',
    emojis: [
      '\u{1F600}', '\u{1F602}', '\u{1F923}', '\u{1F60A}', '\u{1F60D}',
      '\u{1F970}', '\u{1F618}', '\u{1F60E}', '\u{1F929}', '\u{1F60F}',
      '\u{1F605}', '\u{1F607}', '\u{1F642}', '\u{1F609}', '\u{1F973}',
      '\u{1F61B}', '\u{1F61C}', '\u{1F92A}', '\u{1F914}', '\u{1F97A}',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '\u{1F44D}', '\u{1F44E}', '\u{1F44C}', '\u270C\uFE0F', '\u{1F91E}',
      '\u{1F91F}', '\u{1F919}', '\u{1F44F}', '\u{1F64C}', '\u{1F91D}',
      '\u{1F44B}', '\u{1F91A}', '\u{1F590}\uFE0F', '\u270B', '\u{1F596}',
      '\u{1F4AA}', '\u{1F9B5}', '\u{1F9B6}', '\u{1F440}', '\u{1F441}\uFE0F',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '\u2764\uFE0F', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}',
      '\u{1F49C}', '\u{1F5A4}', '\u{1F90D}', '\u{1F90E}', '\u{1F494}',
      '\u2763\uFE0F', '\u{1F495}', '\u{1F49E}', '\u{1F493}', '\u{1F497}',
      '\u{1F496}', '\u{1F498}', '\u{1F49D}', '\u{1F49F}', '\u262E\uFE0F',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '\u{1F389}', '\u{1F38A}', '\u{1F388}', '\u{1F381}', '\u{1F525}',
      '\u26A1', '\u2728', '\u{1F31F}', '\u{1F4AB}', '\u{1F308}',
      '\u{1F355}', '\u{1F354}', '\u{1F32E}', '\u{1F363}', '\u2615',
      '\u{1F37A}', '\u{1F3AE}', '\u{1F4F1}', '\u{1F4BB}', '\u{1F3B5}',
    ],
  },
  ]);

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
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {[1, 24, 168, 720].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => onExpireChange(hours)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  expiresInHours === hours
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/15'
                }`}
              >
                {hours === 1 ? '1h' : hours === 24 ? '1d' : hours === 168 ? '7d' : '30d'}
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
  focusComposerInput,
  textareaRef,
  draft,
  onDraftChange,
}: {
  focusComposerInput: () => void;
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

    requestAnimationFrame(() => {
      focusComposerInput();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + (selected || 'text').length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  return (
    <div className="px-3 pb-0">
      <div
        className="mx-auto w-full max-w-[24rem] flex items-center gap-1 overflow-x-auto"
        style={{ touchAction: 'pan-x' }}
      >
        {FORMATTING_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              applyFormat(action.prefix, action.suffix);
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
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

function AttachmentMenu({
  onSelectFile,
  onClose,
  attachmentMode,
}: {
  onSelectFile: (file: File) => void;
  onClose: () => void;
  attachmentMode: 'all' | 'images-only';
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <MobilePopoverCard
      open
      onClose={onClose}
      label="Attachment Menu"
      id="mobile-attachment-menu"
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
            className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-white/5 text-transparent hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <span className="text-2xl">🖼️</span>
            <ImageIcon className="h-7 w-7 text-gray-300" />
            <span className="text-xs text-gray-300">
              {attachmentMode === 'images-only' ? 'Photo' : 'Photo/Video'}
            </span>
          </button>
          {attachmentMode === 'all' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-white/5 text-transparent hover:bg-white/10 active:bg-white/15 transition-colors"
            >
              <span className="text-2xl">📎</span>
              <Paperclip className="h-7 w-7 text-gray-300" />
              <span className="text-xs text-gray-300">File</span>
            </button>
          )}
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept={attachmentMode === 'images-only' ? 'image/*' : 'image/*,video/*'}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onSelectFile(file);
              onClose();
            }
            event.target.value = '';
          }}
        />
        {attachmentMode === 'all' && (
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onSelectFile(file);
                onClose();
              }
              event.target.value = '';
            }}
          />
        )}
      </div>
    </MobilePopoverCard>
  );
}

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const category = EMOJI_PICKER_CATEGORIES[tab];

  return (
    <MobilePopoverCard
      open
      onClose={onClose}
      label="Emoji Picker"
      id="mobile-emoji-picker"
      placement="docked"
      className="inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-[#0d1525]"
    >
      <div style={{ height: '280px' }}>
        <div className="flex border-b border-white/5 px-2">
          {EMOJI_PICKER_CATEGORIES.map((cat, index) => (
            <button
              key={cat.label}
              type="button"
              onClick={() => setTab(index)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors ${
                tab === index ? 'text-blue-400 border-b-2 border-blue-400 -mb-px' : 'text-gray-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div
          className="grid grid-cols-8 gap-0.5 px-2 py-2 overflow-y-auto"
          style={{ height: 'calc(100% - 40px)', touchAction: 'pan-y' }}
        >
          {category.emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
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
  attachmentMode = 'all',
}: MobileMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAttachment, setShowAttachment] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [mediaExpiresInHours, setMediaExpiresInHours] = useState(24);

  const focusComposerInput = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;

    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    el.style.touchAction = el.scrollHeight > 120 ? 'auto' : 'none';
  }, [draft]);

  const clearSelectedMedia = useCallback(() => {
    setMediaFile((previousValue) => {
      if (previousValue) {
        URL.revokeObjectURL(previousValue.previewUrl);
      }
      return null;
    });
    setMediaExpiresInHours(24);
  }, []);

  useEffect(
    () => () => {
      clearSelectedMedia();
    },
    [clearSelectedMedia]
  );

  const canSend = (draft.trim().length > 0 || mediaFile !== null) && !sending;

  const handleSend = () => {
    const attachment = mediaFile
      ? { file: mediaFile.file, expiresInHours: mediaExpiresInHours }
      : undefined;
    onSend(attachment);
    clearSelectedMedia();
  };

  const handleSelectMedia = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setMediaFile((previousValue) => {
      if (previousValue) {
        URL.revokeObjectURL(previousValue.previewUrl);
      }
      return { file, previewUrl };
    });
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
      focusComposerInput();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="shrink-0" style={{ touchAction: 'none' }}>
      <ComposerMediaPreview
        media={mediaFile}
        expiresInHours={mediaExpiresInHours}
        onExpireChange={setMediaExpiresInHours}
        onRemove={clearSelectedMedia}
      />

      <ComposerReplyBanner replyTarget={replyTarget} onClearReply={onClearReply} />

      <ComposerFormattingToolbar
        focusComposerInput={focusComposerInput}
        textareaRef={textareaRef}
        draft={draft}
        onDraftChange={onDraftChange}
      />

      <div className="px-3 pt-1 pb-0" style={{ touchAction: 'none' }}>
        <div className="mx-auto w-full max-w-[24rem]" style={{ touchAction: 'none' }}>
          <div className="relative rounded-[1.4rem] border border-white/10 bg-white/5 transition-colors focus-within:border-blue-500/50 flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setShowAttachment(true);
                setShowEmoji(false);
              }}
              aria-label="Add attachment"
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
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

            <button
              type="button"
              onClick={() => {
                setShowEmoji((value) => !value);
              }}
              aria-label="Emoji"
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                showEmoji
                  ? 'bg-blue-600/30 text-blue-400'
                  : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>

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

      {showAttachment && (
        <AttachmentMenu
          onSelectFile={handleSelectMedia}
          onClose={() => setShowAttachment(false)}
          attachmentMode={attachmentMode}
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
