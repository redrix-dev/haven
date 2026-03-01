import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ChevronUp } from 'lucide-react';
import type { Message, MessageReaction, MessageAttachment, MessageLinkPreview, AuthorProfile } from '@/lib/backend/types';
import { MobileMessageComposer } from './MobileMessageComposer';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { useMobileLongPress } from '@/renderer/mobile/useMobileLongPress';

interface ReplyTarget {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MobileChannelViewProps {
  channelName: string;
  currentUserId: string;
  currentUserDisplayName: string;
  messages: Message[];
  messageReactions: MessageReaction[];
  messageAttachments: MessageAttachment[];
  messageLinkPreviews: MessageLinkPreview[];
  authorProfiles: Record<string, AuthorProfile>;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  canManageMessages: boolean;
  onRequestOlderMessages: () => void;
  onSendMessage: (content: string, options?: { replyToMessageId?: string }) => Promise<void>;
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
  messageAttachments,
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
}: MobileChannelViewProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);
  const longPress = useMobileLongPress();

  // Group reactions by messageId
  const reactionsByMessage = new Map<string, MessageReaction[]>();
  for (const r of messageReactions) {
    const key = (r as unknown as Record<string, string>)['message_id'] as string;
    if (!reactionsByMessage.has(key)) reactionsByMessage.set(key, []);
    reactionsByMessage.get(key)!.push(r);
  }

  // Index link previews by messageId
  const linkPreviewByMessageId = useMemo(() => {
    const map = new Map<string, MessageLinkPreview>();
    for (const p of messageLinkPreviews) map.set(p.messageId, p);
    return map;
  }, [messageLinkPreviews]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSendMessage(content, replyTarget ? { replyToMessageId: replyTarget.id } : undefined);
      setReplyTarget(null);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Date separators
  let lastDateLabel = '';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {/* Load older messages */}
        {hasOlderMessages && (
          <button
            onClick={onRequestOlderMessages}
            disabled={isLoadingOlderMessages}
            className="w-full flex items-center justify-center gap-2 py-3 mb-2 text-gray-500 text-xs hover:text-gray-300 transition-colors"
          >
            {isLoadingOlderMessages ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ChevronUp className="w-4 h-4" />
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
          const isOwn = message.author_type === 'user' && message.author_user_id === currentUserId;
          const isPlatformStaff = !isHavenDev && Boolean(authorProfile?.isPlatformStaff);
          const username = isHavenDev
            ? 'Haven Developer'
            : (authorProfile?.username ?? message.author_user_id?.substring(0, 8) ?? 'Unknown');
          const displayName = isOwn ? `${username} (You)` : username;
          const initial = username.charAt(0).toUpperCase();
          const avatarUrl = isHavenDev ? null : (authorProfile?.avatarUrl ?? null);
          // Avatar background — amber for haven_dev, blue otherwise (matches desktop color scheme)
          const avatarBg = isHavenDev ? 'bg-[#d6a24a]' : 'bg-blue-600';
          // Username color — matches desktop: amber=haven_dev, staff-blue=staff, muted=everyone else
          const nameColor = isHavenDev ? 'text-[#d6a24a]' : isPlatformStaff ? 'text-[#59b7ff]' : 'text-gray-300';
          const isEditing = editingId === message.id;
          const reactions = reactionsByMessage.get(message.id) ?? [];
          const linkPreview = linkPreviewByMessageId.get(message.id) ?? null;

          const dateLabel = formatDate(message.created_at);
          const showDateSep = dateLabel !== lastDateLabel;
          if (showDateSep) lastDateLabel = dateLabel;

          return (
            <React.Fragment key={message.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-gray-500 text-[11px] font-medium shrink-0">{dateLabel}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              <div
                className={`flex gap-2.5 mb-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                onPointerDown={(event) =>
                  longPress.onPointerDown(event, () => {
                    setContextMenu({ message, isOwnMessage: isOwn });
                  })
                }
                onPointerMove={longPress.onPointerMove}
                onPointerUp={longPress.onPointerUp}
                onPointerLeave={longPress.onPointerLeave}
                onPointerCancel={longPress.onPointerCancel}
              >
                {/* Avatar */}
                {!isOwn && (
                  <div className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 overflow-hidden`}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                    ) : (
                      initial
                    )}
                  </div>
                )}

                <div className={`flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {/* Name + badges + time */}
                  <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className={`text-[11px] font-semibold truncate max-w-[120px] ${nameColor}`}>
                      {displayName}
                    </span>
                    {isPlatformStaff && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[#59b7ff]/20 text-[#9cd6ff] leading-none">
                        Staff
                      </span>
                    )}
                    {/* Dev chip disabled for now
                    {isHavenDev && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[#d6a24a]/20 text-[#d6a24a] leading-none">
                        Dev
                      </span>
                    )} */}
                    <span className="text-[10px] text-gray-600 shrink-0">
                      {formatTime(message.created_at)}
                    </span>
                  </div>

                  {/* Message bubble */}
                  {isEditing ? (
                    <div className="w-full">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="w-full bg-white/10 border border-blue-500/50 rounded-xl px-3 py-2 text-base text-white resize-none focus:outline-none"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={async () => {
                            await onEditMessage(message.id, editDraft.trim());
                            setEditingId(null);
                          }}
                          className="text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[11px] text-gray-500 hover:text-gray-400 px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Bubble — overflow-hidden lets the preview card clip to the bubble's border-radius
                    <div
                      className={`rounded-2xl overflow-hidden text-sm ${
                        isOwn
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-[#1a2840] text-gray-100 rounded-tl-sm border border-white/5'
                      }`}
                    >
                      {/* Message text */}
                      <div className="px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                      </div>

                      {/* Link preview — embedded flush against the bottom of the bubble */}
                      {linkPreview?.status === 'pending' && (
                        <div className={`px-3 py-2 border-t ${isOwn ? 'border-white/20 bg-blue-700/40' : 'border-white/5 bg-black/20'}`}>
                          <p className="text-[11px] opacity-60">Fetching preview…</p>
                        </div>
                      )}
                      {linkPreview?.status === 'ready' && linkPreview.snapshot && (
                        <a
                          href={linkPreview.snapshot.canonicalUrl ?? linkPreview.snapshot.sourceUrl}
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
                              className="w-full max-h-36 object-cover"
                            />
                          )}
                          <div className="px-3 py-2 space-y-0.5">
                            {linkPreview.snapshot.siteName && (
                              <p className={`text-[10px] uppercase tracking-wide ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                                {linkPreview.snapshot.siteName}
                              </p>
                            )}
                            {linkPreview.snapshot.title && (
                              <p className="text-sm font-semibold leading-snug line-clamp-2">
                                {linkPreview.snapshot.title}
                              </p>
                            )}
                            {linkPreview.snapshot.description && (
                              <p className={`text-xs leading-snug line-clamp-2 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                                {linkPreview.snapshot.description}
                              </p>
                            )}
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Reactions */}
                  {reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {reactions.map((r, i) => (
                        <span
                          key={i}
                          className="text-xs bg-white/10 rounded-full px-2 py-0.5 border border-white/10"
                        >
                          {(r as unknown as Record<string, string>)['emoji']}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      <MobileMessageComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        sending={sending}
        placeholder={`Message #${channelName}`}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
      />

      {/* Long-press context menu */}
      <MobileLongPressMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        isOwnMessage={contextMenu?.isOwnMessage ?? false}
        canManageMessages={canManageMessages}
        onReply={() => {
          if (!contextMenu) return;
          const msg = contextMenu.message;
          const profile = msg.author_user_id ? authorProfiles[msg.author_user_id] : undefined;
          setReplyTarget({
            id: msg.id,
            authorLabel: profile?.username ?? 'Unknown',
            preview: msg.content.slice(0, 80),
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
    </div>
  );
}
