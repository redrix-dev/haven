import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DirectMessageConversationSummary } from '@/lib/backend/types';
import { MessageCircle, RefreshCcw, VolumeX } from 'lucide-react';

const DM_SIDEBAR_BASE_MIN_WIDTH = 280;
const DM_SIDEBAR_MAX_WIDTH = 520;
const DM_SIDEBAR_WIDTH_STORAGE_KEY = 'haven:dm-sidebar-width';

type DirectMessagesSidebarProps = {
  currentUserDisplayName: string;
  conversations: DirectMessageConversationSummary[];
  selectedConversationId: string | null;
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: () => void;
};

const formatTimestamp = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getInitial = (value: string | null) => value?.trim().charAt(0).toUpperCase() || 'D';

export function DirectMessagesSidebar({
  currentUserDisplayName,
  conversations,
  selectedConversationId,
  loading,
  refreshing = false,
  error,
  onSelectConversation,
  onRefresh,
}: DirectMessagesSidebarProps) {
  const sidebarRef = React.useRef<HTMLDivElement | null>(null);
  const userTitleRef = React.useRef<HTMLParagraphElement | null>(null);
  const [autoMinWidth, setAutoMinWidth] = React.useState(DM_SIDEBAR_BASE_MIN_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    if (typeof window === 'undefined') return 320;
    const stored = Number(window.localStorage.getItem(DM_SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return 320;
    return Math.max(DM_SIDEBAR_BASE_MIN_WIDTH, Math.min(DM_SIDEBAR_MAX_WIDTH, stored));
  });

  const computedMinWidth = React.useMemo(
    () => Math.max(DM_SIDEBAR_BASE_MIN_WIDTH, Math.min(DM_SIDEBAR_MAX_WIDTH, autoMinWidth)),
    [autoMinWidth]
  );

  const clampSidebarWidth = React.useCallback(
    (value: number) => Math.max(computedMinWidth, Math.min(DM_SIDEBAR_MAX_WIDTH, value)),
    [computedMinWidth]
  );

  React.useLayoutEffect(() => {
    const measure = () => {
      const titleWidth = userTitleRef.current?.scrollWidth ?? 0;
      const reservedHeaderWidth = 110;
      setAutoMinWidth(Math.ceil(titleWidth + reservedHeaderWidth));
    };

    measure();

    if (typeof ResizeObserver === 'undefined' || !userTitleRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(userTitleRef.current);
    return () => observer.disconnect();
  }, [currentUserDisplayName]);

  React.useEffect(() => {
    if (sidebarWidth >= computedMinWidth) return;
    setSidebarWidth(computedMinWidth);
  }, [computedMinWidth, sidebarWidth]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DM_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const handleResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }, []);

  const handleResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing || !sidebarRef.current) return;
      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      setSidebarWidth(clampSidebarWidth(event.clientX - sidebarLeft));
    },
    [clampSidebarWidth, isResizing]
  );

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`relative shrink-0 border-r border-[#22334f] bg-[#162238] flex flex-col ${
        isResizing ? 'select-none' : ''
      }`}
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${computedMinWidth}px`,
        maxWidth: `${DM_SIDEBAR_MAX_WIDTH}px`,
      }}
    >
      <div className="h-16 px-4 border-b border-[#22334f] bg-[#142033] flex items-center">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#8ea4c7]">Direct Messages</p>
            <p ref={userTitleRef} className="text-sm font-semibold text-white truncate">
              {currentUserDisplayName}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[#304867] text-white"
            onClick={onRefresh}
            disabled={loading || refreshing}
            aria-label="Refresh direct messages"
          >
            <RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3 space-y-2">
          {loading ? (
            <p className="text-sm text-[#a9b8cf]">Loading DMs...</p>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : conversations.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#304867] bg-[#142033]/60 p-4">
              <p className="text-sm text-[#a9b8cf]">No DM conversations yet.</p>
              <p className="mt-1 text-xs text-[#90a5c4]">
                Add a friend, then click Message from the Friends panel to start one.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const isSelected = conversation.conversationId === selectedConversationId;
              const title = conversation.otherUsername ?? 'Direct Message';
              const preview =
                conversation.lastMessagePreview?.trim() || 'No messages yet. Start the conversation.';
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => onSelectConversation(conversation.conversationId)}
                  className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[#4a78bd] bg-[#13233c]'
                      : 'border-[#304867] bg-[#142033] hover:bg-[#192946]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 rounded-xl border border-[#304867] bg-[#1b2a42]">
                      {conversation.otherAvatarUrl && (
                        <AvatarImage src={conversation.otherAvatarUrl} alt={title} />
                      )}
                      <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
                        {getInitial(conversation.otherUsername)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{title}</p>
                        {conversation.isMuted && (
                          <VolumeX className="size-3.5 text-[#95a5bf] shrink-0" />
                        )}
                        {conversation.unreadCount > 0 && (
                          <Badge variant="default" className="bg-[#3f79d8] text-white ml-auto">
                            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-2">
                        <MessageCircle className="size-3 text-[#8ea4c7] shrink-0" />
                        <p className="text-xs text-[#a9b8cf] truncate">{preview}</p>
                        {conversation.lastMessageCreatedAt && (
                          <span className="ml-auto shrink-0 text-[11px] text-[#8398ba]">
                            {formatTimestamp(conversation.lastMessageCreatedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div
        role="separator"
        aria-label="Resize Direct Messages Sidebar"
        aria-orientation="vertical"
        className={`absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize ${
          isResizing ? 'bg-[#3f79d8]/40' : 'bg-transparent hover:bg-[#3f79d8]/20'
        }`}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          stopResizing();
        }}
        onPointerCancel={stopResizing}
        onLostPointerCapture={stopResizing}
      />
    </div>
  );
}

