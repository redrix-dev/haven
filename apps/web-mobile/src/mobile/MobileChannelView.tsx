import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, Loader2 } from 'lucide-react';
import type {
  AuthorProfile,
  Message,
  MessageLinkPreview,
  MessageReaction,
} from '@shared/lib/backend/types';
import { MarkdownText } from '@shared/lib/markdownRenderer';
import { MobileSceneScaffold } from '@web-mobile/mobile/layout/MobileSceneScaffold';
import { useMobileViewport } from '@web-mobile/mobile/layout/MobileViewportContext';
import { scrollToBottom } from '@web-mobile/mobile/scrollAnchor';
import { useMobileScrollAnchor } from '@web-mobile/mobile/useMobileScrollAnchor';
import { useMobileLongPress } from '@web-mobile/mobile/useMobileLongPress';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { MobileMessageComposer } from './MobileMessageComposer';

interface ReplyTarget {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MobileChannelViewProps {
  useEnhancedComposer: boolean;
  channelName: string;
  currentUserId: string;
  messages: Message[];
  messageReactions: MessageReaction[];
  messageLinkPreviews: MessageLinkPreview[];
  authorProfiles: Record<string, AuthorProfile>;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  canManageMessages: boolean;
  onRequestOlderMessages: () => void;
  onSendMessage: (
    content: string,
    options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
  ) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReportMessage: (messageId: string) => void;
}

interface ContextMenuState {
  message: Message;
  isOwnMessage: boolean;
}

export function MobileChannelView({
  channelName,
  currentUserId,
  messages,
  messageReactions,
  messageLinkPreviews,
  authorProfiles,
  hasOlderMessages,
  isLoadingOlderMessages,
  canManageMessages,
  onRequestOlderMessages,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  useEnhancedComposer: _useEnhancedComposer,
}: MobileChannelViewProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const hasInitializedScrollRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const longPress = useMobileLongPress();
  const viewport = useMobileViewport();
  const {
    handleComposerBlur,
    handleComposerFocus,
    isNearBottomRef,
  } = useMobileScrollAnchor({
    dockRef,
    keyboardOpen: viewport.keyboardOpen,
    scrollRef,
    shellHeightPx: viewport.shellHeightPx,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    if (!hasInitializedScrollRef.current) {
      hasInitializedScrollRef.current = true;
      scrollToBottom(node);
      return;
    }

    if (!isNearBottomRef.current) {
      return;
    }

    scrollToBottom(node, { behavior: 'smooth' });
  }, [isNearBottomRef, messages.length]);

  const reactionsByMessage = new Map<string, MessageReaction[]>();
  for (const reaction of messageReactions) {
    const key = (reaction as unknown as Record<string, string>)['message_id'] as string;
    if (!reactionsByMessage.has(key)) {
      reactionsByMessage.set(key, []);
    }
    reactionsByMessage.get(key)?.push(reaction);
  }

  const linkPreviewByMessageId = useMemo(() => {
    const map = new Map<string, MessageLinkPreview>();
    for (const preview of messageLinkPreviews) {
      map.set(preview.messageId, preview);
    }
    return map;
  }, [messageLinkPreviews]);

  const handleSend = async (mediaAttachment?: { file: File; expiresInHours: number }) => {
    const content = draft.trim();
    if (!content && !mediaAttachment) return;
    if (sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSendMessage(content, {
        ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
        ...(mediaAttachment
          ? {
              mediaFile: mediaAttachment.file,
              mediaExpiresInHours: mediaAttachment.expiresInHours,
            }
          : {}),
      });
      setReplyTarget(null);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  let lastDateLabel = '';

  return (
    <MobileSceneScaffold
      dockRef={dockRef}
      scrollRef={scrollRef}
      bodyClassName="px-3 py-2"
      body={
        <div className="min-h-full">
          {hasOlderMessages && (
            <button
              onClick={onRequestOlderMessages}
              disabled={isLoadingOlderMessages}
              className="mb-2 flex w-full items-center justify-center gap-2 py-3 text-xs text-gray-500 transition-colors hover:text-gray-300"
            >
              {isLoadingOlderMessages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Load earlier messages
                </>
              )}
            </button>
          )}

          {messages.map((message) => {
            const authorProfile = message.author_user_id
              ? authorProfiles[message.author_user_id]
              : undefined;
            const isHavenDev = message.author_type === 'haven_dev';
            const isOwn =
              message.author_type === 'user' && message.author_user_id === currentUserId;
            const isPlatformStaff = !isHavenDev && Boolean(authorProfile?.isPlatformStaff);
            const username = isHavenDev
              ? 'Haven Developer'
              : (authorProfile?.username ??
                  message.author_user_id?.substring(0, 8) ??
                  'Unknown');
            const displayName = isOwn ? `${username} (You)` : username;
            const initial = username.charAt(0).toUpperCase();
            const avatarUrl = isHavenDev ? null : (authorProfile?.avatarUrl ?? null);
            const avatarBg = isHavenDev ? 'bg-[#d6a24a]' : 'bg-blue-600';
            const nameColor = isHavenDev
              ? 'text-[#d6a24a]'
              : isPlatformStaff
                ? 'text-[#59b7ff]'
                : 'text-gray-300';
            const isEditing = editingId === message.id;
            const reactions = reactionsByMessage.get(message.id) ?? [];
            const linkPreview = linkPreviewByMessageId.get(message.id) ?? null;

            const dateLabel = formatDate(message.created_at);
            const showDateSeparator = dateLabel !== lastDateLabel;
            if (showDateSeparator) {
              lastDateLabel = dateLabel;
            }

            return (
              <React.Fragment key={message.id}>
                {showDateSeparator && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="shrink-0 text-[11px] font-medium text-gray-500">
                      {dateLabel}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                )}

                <div
                  className={`mb-3 flex gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                  {...longPress.bind(() => {
                    setContextMenu({ message, isOwnMessage: isOwn });
                  })}
                >
                  {!isOwn && (
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ${avatarBg} text-xs font-bold text-white`}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </div>
                  )}

                  <div
                    className={`flex max-w-[78%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`mb-1 flex items-center gap-1.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <span
                        className={`max-w-[120px] truncate text-[11px] font-semibold ${nameColor}`}
                      >
                        {displayName}
                      </span>
                      {isPlatformStaff && (
                        <span className="shrink-0 rounded bg-[#59b7ff]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-[#9cd6ff]">
                          Staff
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-gray-600">
                        {formatTime(message.created_at)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="w-full">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          enterKeyHint="done"
                          inputMode="text"
                          autoComplete="off"
                          className="w-full resize-none rounded-xl border border-blue-500/50 bg-white/10 px-3 py-2 text-base text-white focus:outline-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="mt-1 flex gap-2">
                          <button
                            onClick={async () => {
                              await onEditMessage(message.id, editDraft.trim());
                              setEditingId(null);
                            }}
                            className="px-2 py-1 text-[11px] text-blue-400 hover:text-blue-300"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`overflow-hidden rounded-2xl text-sm ${
                          isOwn
                            ? 'rounded-tr-sm bg-blue-600 text-white'
                            : 'rounded-tl-sm border border-white/5 bg-[#1a2840] text-gray-100'
                        }`}
                      >
                        <div className="px-3.5 py-2.5">
                          <MarkdownText content={message.content} />
                        </div>

                        {linkPreview?.status === 'pending' && (
                          <div
                            className={`border-t px-3 py-2 ${
                              isOwn
                                ? 'border-white/20 bg-blue-700/40'
                                : 'border-white/5 bg-black/20'
                            }`}
                          >
                            <p className="text-[11px] opacity-60">Fetching preview...</p>
                          </div>
                        )}
                        {linkPreview?.status === 'ready' && linkPreview.snapshot && (
                          <a
                            href={
                              linkPreview.snapshot.canonicalUrl ?? linkPreview.snapshot.sourceUrl
                            }
                            target="_blank"
                            rel="noreferrer noopener"
                            className={`block border-t transition-colors ${
                              isOwn
                                ? 'border-white/20 bg-blue-700/40 hover:bg-blue-700/60'
                                : 'border-white/5 bg-black/20 hover:bg-black/30'
                            }`}
                          >
                            {linkPreview.snapshot.thumbnail?.signedUrl && (
                              <img
                                src={linkPreview.snapshot.thumbnail.signedUrl}
                                alt={linkPreview.snapshot.title ?? 'Preview'}
                                className="max-h-36 w-full object-cover"
                              />
                            )}
                            <div className="space-y-0.5 px-3 py-2">
                              {linkPreview.snapshot.siteName && (
                                <p
                                  className={`text-[10px] uppercase tracking-wide ${
                                    isOwn ? 'text-blue-200' : 'text-gray-500'
                                  }`}
                                >
                                  {linkPreview.snapshot.siteName}
                                </p>
                              )}
                              {linkPreview.snapshot.title && (
                                <p className="line-clamp-2 text-sm font-semibold leading-snug">
                                  {linkPreview.snapshot.title}
                                </p>
                              )}
                              {linkPreview.snapshot.description && (
                                <p
                                  className={`line-clamp-2 text-xs leading-snug ${
                                    isOwn ? 'text-blue-100' : 'text-gray-400'
                                  }`}
                                >
                                  {linkPreview.snapshot.description}
                                </p>
                              )}
                            </div>
                          </a>
                        )}
                      </div>
                    )}

                    {reactions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {reactions.map((reaction, index) => (
                          <span
                            key={index}
                            className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-xs"
                          >
                            {(reaction as unknown as Record<string, string>)['emoji']}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      }
      dock={
        <MobileMessageComposer
          draft={draft}
          onDraftChange={setDraft}
          onFocus={handleComposerFocus}
          onBlur={handleComposerBlur}
          onSend={handleSend}
          sending={sending}
          placeholder={`Message #${channelName}`}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
        />
      }
    >
      <MobileLongPressMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        isOwnMessage={contextMenu?.isOwnMessage ?? false}
        canManageMessages={canManageMessages}
        onReply={() => {
          if (!contextMenu) return;
          const message = contextMenu.message;
          const profile = message.author_user_id
            ? authorProfiles[message.author_user_id]
            : undefined;
          setReplyTarget({
            id: message.id,
            authorLabel: profile?.username ?? 'Unknown',
            preview: message.content.slice(0, 80),
          });
        }}
        onEdit={() => {
          if (!contextMenu) return;
          setEditingId(contextMenu.message.id);
          setEditDraft(contextMenu.message.content);
        }}
        onDelete={() => {
          if (!contextMenu) return;
          void onDeleteMessage(contextMenu.message.id);
        }}
        onReport={() => {
          if (!contextMenu) return;
          onReportMessage(contextMenu.message.id);
        }}
      />
    </MobileSceneScaffold>
  );
}
