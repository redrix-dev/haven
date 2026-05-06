import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import { Badge } from "@shared/app/ui/badge";
import { Button } from "@shared/app/ui/button";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import { Skeleton } from "@shared/app/ui/skeleton";
import { DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT } from "@shared/lib/backend/directMessageUtils";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import { useDmStore } from "@shared/stores/dmStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { MessageCircle, RefreshCcw, VolumeX } from "lucide-react";

const DM_SIDEBAR_BASE_MIN_WIDTH = 280;
const DM_SIDEBAR_MAX_WIDTH = 520;
const DM_SIDEBAR_WIDTH_STORAGE_KEY = "haven:dm-sidebar-width";

type DirectMessagesSidebarProps = {
  currentUserDisplayName: string;
  refreshing?: boolean;
  error: string | null;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: () => void;
};

const formatTimestamp = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const getInitial = (value: string | null) =>
  value?.trim().charAt(0).toUpperCase() || "D";

export function DirectMessagesSidebar({
  currentUserDisplayName,
  refreshing = false,
  error,
  onSelectConversation,
  onRefresh,
}: DirectMessagesSidebarProps) {
  const conversations = useDmStore((state) => state.conversations);
  const selectedConversationId = useDmStore(
    (state) => state.currentConversationId,
  );
  const loading = useDmStore((state) => state.isLoading);
  const unreadCounts = useDmStore((state) => state.unreadCounts);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const sidebarRef = React.useRef<HTMLDivElement | null>(null);
  const userTitleRef = React.useRef<HTMLParagraphElement | null>(null);
  const [autoMinWidth, setAutoMinWidth] = React.useState(
    DM_SIDEBAR_BASE_MIN_WIDTH,
  );
  const [isResizing, setIsResizing] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const stored = Number(
      window.localStorage.getItem(DM_SIDEBAR_WIDTH_STORAGE_KEY),
    );
    if (!Number.isFinite(stored) || stored <= 0) return 320;
    return Math.max(
      DM_SIDEBAR_BASE_MIN_WIDTH,
      Math.min(DM_SIDEBAR_MAX_WIDTH, stored),
    );
  });

  const computedMinWidth = React.useMemo(
    () =>
      Math.max(
        DM_SIDEBAR_BASE_MIN_WIDTH,
        Math.min(DM_SIDEBAR_MAX_WIDTH, autoMinWidth),
      ),
    [autoMinWidth],
  );

  const clampSidebarWidth = React.useCallback(
    (value: number) =>
      Math.max(computedMinWidth, Math.min(DM_SIDEBAR_MAX_WIDTH, value)),
    [computedMinWidth],
  );

  React.useLayoutEffect(() => {
    const measure = () => {
      const titleWidth = userTitleRef.current?.scrollWidth ?? 0;
      const reservedHeaderWidth = 110;
      setAutoMinWidth(Math.ceil(titleWidth + reservedHeaderWidth));
    };

    measure();

    if (typeof ResizeObserver === "undefined" || !userTitleRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(userTitleRef.current);
    return () => observer.disconnect();
  }, [currentUserDisplayName]);

  React.useEffect(() => {
    if (sidebarWidth >= computedMinWidth) return;
    setSidebarWidth(computedMinWidth);
  }, [computedMinWidth, sidebarWidth]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DM_SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidth),
    );
  }, [sidebarWidth]);

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
    },
    [],
  );

  const handleResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing || !sidebarRef.current) return;
      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      setSidebarWidth(clampSidebarWidth(event.clientX - sidebarLeft));
    },
    [clampSidebarWidth, isResizing],
  );

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`relative flex shrink-0 flex-col overflow-x-hidden border-r border-surface-hover bg-surface-toast ${
        isResizing ? "select-none" : ""
      }`}
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${computedMinWidth}px`,
        maxWidth: `${DM_SIDEBAR_MAX_WIDTH}px`,
      }}
    >
      <div className="h-16 px-4 border-b border-surface-hover bg-surface-panel flex items-center">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Direct Messages
            </p>
            <p
              ref={userTitleRef}
              className="text-sm font-semibold text-white truncate"
            >
              {currentUserDisplayName}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-border text-white"
            onClick={onRefresh}
            disabled={loading || refreshing}
            aria-label="Refresh direct messages"
          >
            <RefreshCcw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:max-w-full [&_[data-slot=scroll-area-viewport]]:min-w-0 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
        <div className="box-border min-w-0 max-w-full space-y-2 p-3">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="rounded-md border border-border bg-surface-panel px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="size-10 rounded-xl bg-surface-hover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28 bg-surface-hover" />
                      <Skeleton className="ml-auto h-4 w-8 rounded-full bg-surface-hover" />
                    </div>
                    <Skeleton className="h-3 w-full bg-surface-skeleton" />
                  </div>
                </div>
              </div>
            ))
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : conversations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface-panel/60 p-4">
              <p className="text-sm text-muted-foreground">No DM conversations yet.</p>
              <p className="mt-1 text-xs text-auxiliary">
                Add a friend, then click Message from the Friends panel to start
                one.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const isSelected =
                conversation.conversationId === selectedConversationId;
              const title =
                resolveLiveUsername(
                  liveProfiles,
                  conversation.otherUserId,
                  conversation.otherUsername,
                ) ?? "Direct Message";
              const avatarUrl = resolveLiveAvatarUrl(
                liveProfiles,
                conversation.otherUserId,
                conversation.otherAvatarUrl,
              );
              const preview =
                conversation.lastMessagePreview?.trim() ||
                (conversation.lastMessageId
                  ? DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT
                  : "No messages yet. Start the conversation.");
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() =>
                    onSelectConversation(conversation.conversationId)
                  }
                  className={`min-w-0 max-w-full overflow-x-hidden rounded-md border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-border-notification bg-surface-row-active"
                      : "border-border bg-surface-panel hover:bg-surface-dm-row-hover"
                  } w-full`}
                >
                  <div className="flex min-w-0 max-w-full items-start gap-3">
                    <Avatar className="size-10 shrink-0 rounded-xl border border-border bg-surface-skeleton">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
                      <AvatarFallback className="rounded-xl bg-surface-skeleton text-white text-xs">
                        {getInitial(title)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-white">
                          {title}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {conversation.isMuted && (
                            <VolumeX className="size-3.5 shrink-0 text-meta" />
                          )}
                          {(unreadCounts[conversation.conversationId] ??
                            conversation.unreadCount) > 0 && (
                            <Badge variant="default" className="bg-primary text-white">
                              {(unreadCounts[conversation.conversationId] ??
                                conversation.unreadCount) > 99
                                ? "99+"
                                : (unreadCounts[conversation.conversationId] ??
                                  conversation.unreadCount)}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div
                        className={`mt-1 grid min-w-0 max-w-full items-center gap-x-2 ${
                          conversation.lastMessageCreatedAt
                            ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                            : "grid-cols-[auto_minmax(0,1fr)]"
                        }`}
                      >
                        <MessageCircle className="size-3 shrink-0 text-muted-foreground" />
                        <p className="min-w-0 truncate text-xs text-muted-foreground">
                          {preview}
                        </p>
                        {conversation.lastMessageCreatedAt ? (
                          <span className="shrink-0 text-right text-[11px] text-dm-meta tabular-nums">
                            {formatTimestamp(conversation.lastMessageCreatedAt)}
                          </span>
                        ) : null}
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
          isResizing
            ? "bg-primary/40"
            : "bg-transparent hover:bg-primary/20"
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
